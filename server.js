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

// Sessão para login
app.use(session({
  secret: 'chave-secreta',
  resave: false,
  saveUninitialized: true
}));

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Upload com Multer
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
  res.redirect('/login.html');
}

// Rotas públicas
app.use(express.static(path.join(__dirname, 'public')));

// Rota de login (POST)
app.post('/login', (req, res) => {
  const { usuario, senha } = req.body;
  if (usuario === process.env.USER_ADMIN && senha === process.env.PASS_ADMIN) {
    req.session.autenticado = true;
    res.redirect('/controleIndica.html');
  } else {
    res.send('Usuário ou senha inválidos');
  }
});

// Protege acesso à tela de controle
app.get('/controleIndica.html', autenticar, (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'controleIndica.html'));
});

// Rota para baixar currículo (protegido)
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

// Salvar indicação
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

// Buscar indicações
app.get('/indicacoes', autenticar, async (req, res) => {
  const dados = await Indicacao.find().sort({ createdAt: -1 });
  res.json(dados);
});

// Atualizar status da indicação
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

app.listen(PORT, () => {
  console.log(`Servidor rodando na http://localhost:${PORT}`);
});