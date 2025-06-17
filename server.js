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

mongoose.connect(process.env.MONGO_URI, {
  useNewUrlParser: true,
  useUnifiedTopology: true
}).then(() => console.log('MongoDB conectado'))
  .catch(err => console.error('Erro ao conectar no MongoDB:', err));

// Modelo
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

// Sessão
app.use(session({
  secret: 'chave-secreta',
  resave: false,
  saveUninitialized: true
}));

// CORS
app.use(cors({ origin: "https://indica.essencial.com.br", credentials: true }));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Headers CORS extras
app.use((req, res, next) => {
  res.header("Access-Control-Allow-Origin", "https://indica.essencial.com.br");
  res.header("Access-Control-Allow-Headers", "Origin, X-Requested-With, Content-Type, Accept, Authorization");
  res.header("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, PATCH, OPTIONS");
  next();
});

// Uploads
if (!fs.existsSync('uploads')) {
  fs.mkdirSync('uploads');
}
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, 'uploads/'),
  filename: (req, file, cb) => cb(null, Date.now() + '-' + file.originalname)
});
const upload = multer({ storage });

// Autenticação
function autenticar(req, res, next) {
  if (req.session && req.session.autenticado) return next();
  res.redirect('/login.html');
}

// Arquivos públicos
app.use(express.static(path.join(__dirname, 'public')));
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// Login
app.post('/login', (req, res) => {
  const { usuario, senha } = req.body;
  if (usuario === process.env.USER_ADMIN && senha === process.env.PASS_ADMIN) {
    req.session.autenticado = true;
    res.redirect('/controleIndica.html');
  } else {
    res.send('Usuário ou senha inválidos');
  }
});

// Tela protegida
app.get('/controleIndica.html', autenticar, (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'controleIndica.html'));
});

// Baixar currículo
app.get('/download/:id', autenticar, async (req, res) => {
  try {
    const indicacao = await Indicacao.findById(req.params.id);
    if (!indicacao || !indicacao.curriculo) {
      return res.status(404).send('Currículo não encontrado');
    }
    const filePath = path.join(__dirname, indicacao.curriculo);
    if (fs.existsSync(filePath)) {
      res.download(filePath);
    } else {
      res.status(404).send('Arquivo não encontrado');
    }
  } catch (err) {
    res.status(500).send('Erro interno');
  }
});

// Submit do formulário
app.post('/submit', upload.single('curriculo'), async (req, res) => {
  const { nome, telefone, posto, regras } = req.body;
  const nova = new Indicacao({
    nome,
    telefone,
    posto,
    regras: regras === 'on',
    curriculo: req.file ? path.join('uploads', req.file.filename) : null
  });
  await nova.save();
  res.redirect('/index.html');
});

// Buscar todas indicações
app.get('/indicacoes', autenticar, async (req, res) => {
  const dados = await Indicacao.find().sort({ createdAt: -1 });
  res.json(dados);
});

// Atualizar status
app.put('/indicacoes/:id/status', async (req, res) => {
  try {
    const { status } = req.body;
    await Indicacao.findByIdAndUpdate(req.params.id, { status });
    res.status(200).send("Status atualizado com sucesso.");
  } catch (err) {
    res.status(500).send("Erro ao atualizar status.");
  }
});

// Excluir indicação
app.delete('/indicacoes/:id', async (req, res) => {
  try {
    await Indicacao.findByIdAndDelete(req.params.id);
    res.status(200).send("Indicação excluída com sucesso.");
  } catch (err) {
    res.status(500).send("Erro ao excluir indicação.");
  }
});

// 404 Final - deve estar no fim
app.use((req, res) => {
  res.status(404).send("Rota não encontrada.");
});

// Inicia servidor
app.listen(PORT, () => {
  console.log(`Servidor rodando na porta ${PORT}`);
});
