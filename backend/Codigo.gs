/** CONSÓRCIO VAPT VUPT - backend (script vinculado à planilha). Etapa 1. */

var ABAS = {
  CONFIG: ['chave', 'valor'],
  PARTICIPANTES: ['id', 'nome', 'grupo', 'ordem', 'mesRecebimento', 'criadoEm'],
  SORTEIOS: ['id', 'dataHora', 'grupo', 'mes', 'participanteId', 'nome', 'codigo'],
  PARCELAS: ['id', 'participanteId', 'mes', 'vencimento', 'valor', 'status', 'pagoEm'],
  FERIADOS: ['data'],
  USUARIOS: ['id', 'usuario', 'senhaHash', 'salt', 'papel', 'participanteId', 'criadoEm'],
  SESSOES: ['token', 'usuarioId', 'expira'],
  BANNERS: ['id', 'slot', 'imagem', 'link', 'ordem']
};
var COLUNAS_TEXTO = ['chave', 'valor', 'mes', 'mesRecebimento', 'vencimento', 'pagoEm', 'data', 'dataHora', 'criadoEm', 'usuario', 'senhaHash', 'salt', 'token', 'expira'];

function ss_() { return SpreadsheetApp.getActiveSpreadsheet(); }
function tz_() { return Session.getScriptTimeZone(); }
function hoje_() { return Utilities.formatDate(new Date(), tz_(), 'yyyy-MM-dd'); }
function agora_() { return Utilities.formatDate(new Date(), tz_(), 'yyyy-MM-dd HH:mm:ss'); }
function novoId_() { return Utilities.getUuid().substr(0, 8); }

function setup() {
  var ss = ss_();
  Object.keys(ABAS).forEach(function (nome) {
    var sh = ss.getSheetByName(nome) || ss.insertSheet(nome);
    var cab = ABAS[nome];
    cab.forEach(function (c, i) {
      if (COLUNAS_TEXTO.indexOf(c) >= 0) sh.getRange(1, i + 1, sh.getMaxRows(), 1).setNumberFormat('@');
    });
    if (sh.getLastRow() === 0) sh.getRange(1, 1, 1, cab.length).setValues([cab]);
  });
  var cfg = lerConfig_();
  var padrao = { parcela: '100', premio: '1200', inicio: '2027-01', meses: '12', grupos: '3', dataSorteio: '', velocidade: '5' };
  Object.keys(padrao).forEach(function (k) {
    if (cfg[k] === undefined) ss.getSheetByName('CONFIG').appendRow([k, padrao[k]]);
  });
  return 'setup ok';
}

function lerAba_(nome) {
  var sh = ss_().getSheetByName(nome);
  var cab = ABAS[nome], n = sh.getLastRow() - 1;
  if (n < 1) return [];
  var vals = sh.getRange(2, 1, n, cab.length).getValues();
  return vals.map(function (linha) {
    var o = {};
    cab.forEach(function (c, i) {
      var v = linha[i];
      if (v instanceof Date) v = Utilities.formatDate(v, tz_(), (c === 'mes' || c === 'mesRecebimento') ? 'yyyy-MM' : 'yyyy-MM-dd');
      o[c] = v;
    });
    return o;
  });
}

function lerConfig_() {
  var o = {};
  lerAba_('CONFIG').forEach(function (r) { o[String(r.chave)] = String(r.valor); });
  return o;
}

function lerFeriados_() {
  var f = {};
  lerAba_('FERIADOS').forEach(function (r) { if (r.data) f[String(r.data)] = true; });
  return f;
}

function escrever_(nome, linhas) {
  if (!linhas.length) return;
  var sh = ss_().getSheetByName(nome), cab = ABAS[nome];
  var matriz = linhas.map(function (o) { return cab.map(function (c) { return o[c] === undefined ? '' : o[c]; }); });
  sh.getRange(sh.getLastRow() + 1, 1, matriz.length, cab.length).setValues(matriz);
}

function cadastrarParticipante(nome) {
  nome = String(nome || '').trim();
  if (!nome) throw new Error('Informe o nome');
  if (lerAba_('SORTEIOS').length) throw new Error('O sorteio já foi realizado; não é possível cadastrar novos participantes');
  var dup = lerAba_('PARTICIPANTES').some(function (p) { return String(p.nome).toLowerCase() === nome.toLowerCase(); });
  if (dup) throw new Error('Participante já cadastrado: ' + nome);
  var id = novoId_();
  escrever_('PARTICIPANTES', [{ id: id, nome: nome, criadoEm: agora_() }]);
  return id;
}

function sha256_(txt) {
  var b = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, txt, Utilities.Charset.UTF_8);
  return b.map(function (x) { return ('0' + (x < 0 ? x + 256 : x).toString(16)).slice(-2); }).join('');
}

/** Sorteia grupos e sequência, grava SORTEIOS e PARCELAS. Só roda uma vez. */
function realizarSorteio() {
  var lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    if (lerAba_('SORTEIOS').length) throw new Error('O sorteio já foi realizado');
    var cfg = lerConfig_();
    var qtdGrupos = parseInt(cfg.grupos, 10), qtdMeses = parseInt(cfg.meses, 10), valor = parseFloat(cfg.parcela);
    var parts = lerAba_('PARTICIPANTES');
    if (!parts.length) throw new Error('Nenhum participante cadastrado');
    var meses = listaMeses(cfg.inicio, qtdMeses);
    var ids = parts.map(function (p) { return String(p.id); });
    var grupos = dividirEmGrupos(ids, qtdGrupos, Math.random);
    var seq = sortearSequencias(grupos, meses, Math.random);
    var codigo = sha256_(JSON.stringify(seq) + agora_());
    var nomePorId = {};
    parts.forEach(function (p) { nomePorId[String(p.id)] = p.nome; });

    var dataHora = agora_();
    escrever_('SORTEIOS', seq.map(function (s) {
      return { id: novoId_(), dataHora: dataHora, grupo: s.grupo, mes: s.mes, participanteId: s.participanteId, nome: nomePorId[s.participanteId], codigo: codigo };
    }));

    var info = {};
    seq.forEach(function (s, i) { info[s.participanteId] = { grupo: s.grupo, mes: s.mes }; });
    var posicao = {};
    seq.forEach(function (s) { posicao[s.participanteId] = meses.indexOf(s.mes) + 1; });
    var sh = ss_().getSheetByName('PARTICIPANTES');
    var novas = parts.map(function (p) {
      var i = info[String(p.id)];
      return [i.grupo, posicao[String(p.id)], i.mes];
    });
    sh.getRange(2, 3, novas.length, 3).setValues(novas);

    var parcelas = gerarParcelas(ids, meses, valor, lerFeriados_()).map(function (p) { p.id = novoId_(); return p; });
    escrever_('PARCELAS', parcelas);
    return { codigo: codigo, participantes: ids.length, grupos: qtdGrupos, meses: qtdMeses, parcelas: parcelas.length };
  } finally {
    lock.releaseLock();
  }
}

function realizarSorteioAgendado() {
  try { Logger.log(JSON.stringify(realizarSorteio())); }
  catch (e) { Logger.log('Falha no sorteio agendado: ' + e.message); }
}

/** Lê CONFIG.dataSorteio ('AAAA-MM-DD HH:MM') e cria o gatilho. */
function agendarSorteio() {
  var txt = lerConfig_().dataSorteio;
  var m = /^(\d{4})-(\d{2})-(\d{2}) (\d{2}):(\d{2})$/.exec(String(txt || '').trim());
  if (!m) throw new Error("Preencha CONFIG > dataSorteio no formato AAAA-MM-DD HH:MM");
  var quando = new Date(+m[1], +m[2] - 1, +m[3], +m[4], +m[5]);
  if (quando.getTime() <= Date.now()) throw new Error('A data do sorteio já passou');
  ScriptApp.getProjectTriggers().forEach(function (t) {
    if (t.getHandlerFunction() === 'realizarSorteioAgendado') ScriptApp.deleteTrigger(t);
  });
  ScriptApp.newTrigger('realizarSorteioAgendado').timeBased().at(quando).create();
  return 'Sorteio agendado para ' + txt;
}

function confirmarPagamento(parcelaId) {
  var sh = ss_().getSheetByName('PARCELAS');
  var n = sh.getLastRow() - 1;
  if (n < 1) throw new Error('Sem parcelas');
  var ids = sh.getRange(2, 1, n, 1).getValues();
  for (var i = 0; i < n; i++) {
    if (String(ids[i][0]) === String(parcelaId)) {
      sh.getRange(i + 2, 6, 1, 2).setValues([['PAGO', hoje_()]]);
      return 'ok';
    }
  }
  throw new Error('Parcela não encontrada');
}

/** Lista por grupo, com cor de cada participante no mês informado ('AAAA-MM'; padrão: mês atual). */
function painel(mes) {
  var hoje = hoje_();
  var parts = lerAba_('PARTICIPANTES'), parcelas = lerAba_('PARCELAS');
  if (!mes) {
    var hm = hoje.substr(0, 7), vistos = {};
    parcelas.forEach(function (p) { vistos[p.mes] = 1; });
    var ms = Object.keys(vistos).sort();
    mes = ms.indexOf(hm) >= 0 ? hm : (ms.filter(function (m) { return m > hm; })[0] || ms[ms.length - 1] || hm);
  }
  var porPart = {};
  parcelas.forEach(function (p) { if (p.mes === mes) porPart[String(p.participanteId)] = p; });
  var resumo = { arrecadado: 0, pendente: 0, inadimplente: 0 };
  var grupos = {};
  parts.forEach(function (p) {
    var pa = porPart[String(p.id)];
    var cor = pa ? corParcela(pa.status, pa.vencimento, hoje) : 'amarelo';
    if (pa) {
      var v = Number(pa.valor) || 0;
      if (cor === 'verde') resumo.arrecadado += v;
      else if (cor === 'vermelho') resumo.inadimplente += v;
      else resumo.pendente += v;
    }
    var g = p.grupo || 0;
    (grupos[g] = grupos[g] || []).push({ id: p.id, nome: p.nome, parcelaId: pa ? pa.id : '', vencimento: pa ? pa.vencimento : '', cor: cor, mesRecebimento: p.mesRecebimento });
  });
  return { mes: mes, resumo: resumo, grupos: grupos };
}

function simularSorteio_() {
  var ids = []; for (var i = 1; i <= 36; i++) ids.push('P' + i);
  var meses = listaMeses('2027-01', 12);
  var seq = sortearSequencias(dividirEmGrupos(ids, 3, Math.random), meses, Math.random);
  var porMes = {};
  seq.forEach(function (s) { porMes[s.mes] = (porMes[s.mes] || 0) + 1; });
  return seq.length === 36 && meses.every(function (m) { return porMes[m] === 3; });
}

function testeRapido() {
  var r = [];
  function t(nome, ok) { r.push((ok ? 'OK   ' : 'FALHOU ') + nome); }
  t('setup', setup() === 'setup ok');
  Object.keys(ABAS).forEach(function (n) { t('aba ' + n, !!ss_().getSheetByName(n)); });
  var cfg = lerConfig_();
  t('CONFIG preenchido', !!cfg.parcela && !!cfg.inicio && !!cfg.meses && !!cfg.grupos);
  t('5º dia útil 2026-12 = 2026-12-07', quintoDiaUtil(2026, 12, {}) === '2026-12-07');
  t('simulação 36 participantes / 3 grupos / 3 por mês', simularSorteio_());
  t('cores', corParcela('PAGO', '2027-01-07', '2027-02-01') === 'verde' && corParcela('PENDENTE', '2027-01-07', '2027-01-08') === 'vermelho' && corParcela('PENDENTE', '2027-01-07', '2027-01-07') === 'amarelo');
  t('hash SHA-256 (64 caracteres)', sha256_('teste').length === 64);
  Logger.log(r.join('\n'));
  return r.join('\n');
}
