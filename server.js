require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const multer = require('multer');
const cors = require('cors');
const path = require('path');
const session = require('express-session');
const fs = require('fs');

const app = express();
const PORT = process.env.PORT || 3000;

// Conexão com o MongoDB
mongoose
  .connect(process.env.MONGO_URI, {
    useNewUrlParser: true,
    useUnifiedTopology: true
  })
  .then(() => console.log('MongoDB conectado'))
  .catch(err => console.error('Erro ao conectar no MongoDB:', err));

// Modelo de indicação
const indicacaoSchema = new mongoose.Schema({
  nome: String,
  telefone: String,
  posto: String,
  regras: Boolean,
  curriculo: String,
  createdAt: { type: Date, default: Date.now },
  status: { type: String, default: "Sem status" }
});
const Indicacao = mongoose.model('Indicacao', indicacaoSchema);

// Configuração da sessão
app.use(
  session({
    secret: process.env.SESSION_SECRET || 'chave-secreta',
    resave: false,
    saveUninitialized: true,
    cookie: {
      secure: false, // Altere para true se usar HTTPS
      httpOnly: true
    }
  })
);

// Configuração do CORS para autorizar requisições do seu frontend
app.use(
  cors({
    origin: "https://indica.essencial.com.br", // Atualize para o domínio do seu frontend
    credentials: true
  })
);

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Configuração para uploads
if (!fs.existsSync('uploads')) {
  fs.mkdirSync('uploads');
}
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, 'uploads/'),
  filename: (req, file, cb) => cb(null, Date.now() + '-' + file.originalname)
});
const upload = multer({ storage });

// Middleware de autenticação
function autenticar(req, res, next) {
  if (req.session && req.session.autenticado) return next();
  res.status(401).json({ message: "Não autenticado" });
}

// Endpoint de Login (retorna resposta em JSON)
app.post('/login', (req, res) => {
  const { usuario, senha } = req.body;
  if (usuario === process.env.USER_ADMIN && senha === process.env.PASS_ADMIN) {
    req.session.autenticado = true;
    return res.redirect('https://indica.essencial.com.br/controleIndica');
  }
  return res.status(401).json({ message: 'Usuário ou senha inválidos' });
});

// (Opcional) Endpoint de Logout
app.post('/logout', (req, res) => {
  req.session.destroy();
  res.status(200).json({ message: 'Logout efetuado com sucesso' });
});

// Endpoint para enviar nova indicação
app.post('/submit', upload.single('curriculo'), async (req, res) => {
  try {
    const { nome, telefone, posto, regras } = req.body;
    const novaIndicacao = new Indicacao({
      nome,
      telefone,
      posto,
      regras: regras === 'on',
      curriculo: req.file ? path.join('uploads', req.file.filename) : null
    });
    await novaIndicacao.save();
    res.status(201).json({ message: "Indicação criada com sucesso" });
  } catch (err) {
    res.status(500).json({ message: "Erro no envio da indicação", error: err.message });
  }
});

// Endpoint para buscar todas as indicações (rota protegida)
app.get('/indicacoes', autenticar, async (req, res) => {
  try {
    const dados = await Indicacao.find().sort({ createdAt: -1 });
    res.status(200).json(dados);
  } catch (err) {
    res.status(500).json({ message: "Erro ao buscar indicações", error: err.message });
  }
});

// Endpoint para atualizar o status de uma indicação (rota protegida)
app.put('/indicacoes/:id/status', autenticar, async (req, res) => {
  try {
    const { status } = req.body;
    await Indicacao.findByIdAndUpdate(req.params.id, { status });
    res.status(200).json({ message: "Status atualizado com sucesso." });
  } catch (err) {
    res.status(500).json({ message: "Erro ao atualizar status.", error: err.message });
  }
});

// Endpoint para excluir uma indicação (rota protegida)
app.delete('/indicacoes/:id', autenticar, async (req, res) => {
  try {
    await Indicacao.findByIdAndDelete(req.params.id);
    res.status(200).json({ message: "Indicação excluída com sucesso." });
  } catch (err) {
    res.status(500).json({ message: "Erro ao excluir indicação.", error: err.message });
  }
});

// Endpoint para download do currículo (rota protegida)
app.get('/download/:id', autenticar, async (req, res) => {
  try {
    const indicacao = await Indicacao.findById(req.params.id);
    if (!indicacao || !indicacao.curriculo) {
      return res.status(404).json({ message: "Currículo não encontrado" });
    }
    const filePath = path.join(__dirname, indicacao.curriculo);
    if (fs.existsSync(filePath)) {
      res.download(filePath);
    } else {
      res.status(404).json({ message: "Arquivo não encontrado" });
    }
  } catch (err) {
    res.status(500).json({ message: "Erro interno", error: err.message });
  }
});

// Middleware 404 para rotas desconhecidas
app.use((req, res) => {
  res.status(404).json({ message: "Rota não encontrada." });
});

// Inicializa o servidor
app.listen(PORT, () => {
  console.log(`Servidor rodando na porta ${PORT}`);
}); 