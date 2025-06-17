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
  curriculo: String, // Em uma solução robusta, este seria o URL do arquivo em um serviço de storage (S3, etc)
  createdAt: { type: Date, default: Date.now },
  status: { type: String, default: "Sem status" }
});
const Indicacao = mongoose.model('Indicacao', indicacaoSchema);

// === ALTERAÇÃO CRÍTICA: Configuração da Sessão para Cross-Domain ===
// Necessário para o Express confiar no proxy do Render e o cookie 'secure' funcionar
app.set('trust proxy', 1);

app.use(
  session({
    secret: process.env.SESSION_SECRET || 'chave-secreta-muito-forte',
    resave: false,
    saveUninitialized: true,
    cookie: {
      secure: true,       // OBRIGATÓRIO para cross-site cookies; o Render usa HTTPS.
      httpOnly: true,
      sameSite: "none"    // OBRIGATÓRIO para permitir que o cookie seja enviado de um domínio diferente.
    }
  })
);

// Configuração do CORS
app.use(
  cors({
    origin: "https://indica.essencial.com.br", // Domínio do seu frontend
    credentials: true // Permite que o frontend envie cookies
  })
);

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));

// === AVISO: Configuração de Uploads - NÃO RECOMENDADO PARA RENDER ===
// O sistema de arquivos do Render é efêmero. Os arquivos enviados serão perdidos!
// Considere usar um serviço como AWS S3, Google Cloud Storage ou Cloudinary.
if (!fs.existsSync('uploads')) {
  fs.mkdirSync('uploads');
}
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, 'uploads/'),
  filename: (req, file, cb) => cb(null, Date.now() + '-' + file.originalname)
});
const upload = multer({ storage });

// Middleware de autenticação (sem alterações)
function autenticar(req, res, next) {
  if (req.session && req.session.autenticado) {
    return next();
  }
  res.status(401).json({ message: "Não autenticado. Por favor, faça o login novamente." });
}

// Rota de Login (sem alterações)
app.post('/login', (req, res) => {
  const { usuario, senha } = req.body;
  if (usuario === process.env.USER_ADMIN && senha === process.env.PASS_ADMIN) {
    req.session.autenticado = true;
    return res.status(200).json({ message: 'Login realizado com sucesso' });
  }
  return res.status(401).json({ message: 'Usuário ou senha inválidos' });
});

// Rota de Logout (sem alterações)
app.post('/logout', (req, res) => {
  req.session.destroy(err => {
    if (err) {
      return res.status(500).json({ message: 'Erro ao fazer logout' });
    }
    // Limpa o cookie no navegador para garantir o logout completo
    res.clearCookie('connect.sid'); // 'connect.sid' é o nome padrão do cookie de sessão do Express
    res.status(200).json({ message: 'Logout efetuado com sucesso' });
  });
});

// Rota de Envio de Indicação (sem alterações, mas ciente do problema de storage)
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

// Rota para buscar indicações (sem alterações)
app.get('/indicacoes', autenticar, async (req, res) => {
  try {
    const dados = await Indicacao.find().sort({ createdAt: -1 });
    res.status(200).json(dados);
  } catch (err) {
    res.status(500).json({ message: "Erro ao buscar indicações", error: err.message });
  }
});

// Rota para atualizar status (sem alterações)
app.put('/indicacoes/:id/status', autenticar, async (req, res) => {
  try {
    const { status } = req.body;
    await Indicacao.findByIdAndUpdate(req.params.id, { status });
    res.status(200).json({ message: "Status atualizado com sucesso." });
  } catch (err) {
    res.status(500).json({ message: "Erro ao atualizar status.", error: err.message });
  }
});

// Rota para excluir indicação (sem alterações)
app.delete('/indicacoes/:id', autenticar, async (req, res) => {
  try {
    await Indicacao.findByIdAndDelete(req.params.id);
    res.status(200).json({ message: "Indicação excluída com sucesso." });
  } catch (err) {
    res.status(500).json({ message: "Erro ao excluir indicação.", error: err.message });
  }
});

// Rota de download (sem alterações, mas ciente que pode falhar)
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
      res.status(404).json({ message: "Arquivo não encontrado no servidor. Pode ter sido excluído devido a uma reinicialização." });
    }
  } catch (err) {
    res.status(500).json({ message: "Erro interno", error: err.message });
  }
});

app.use((req, res) => {
  res.status(404).json({ message: "Rota não encontrada." });
});

app.listen(PORT, () => {
  console.log(`Servidor rodando na porta ${PORT}`);
});