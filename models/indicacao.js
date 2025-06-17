const mongoose = require('mongoose');

const indicacaoSchema = new mongoose.Schema({
  nome: String,
  telefone: String,
  posto: String,
  regras: Boolean,
  curriculo: String,
  createdAt: { type: Date, default: Date.now },
  status: { type: String, default: "Sem status" }
});

module.exports = mongoose.model('Indicacao', indicacaoSchema);
