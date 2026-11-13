/** API do Web App. Front chama doPost com JSON em texto: {acao, token, ...}. doGet = dados públicos. */

var CONFIG_PERMITIDAS = ['parcela', 'acrescimo', 'inicio', 'meses', 'grupos', 'dataSorteio', 'velocidade'];
var CONFIG_LIVRES_APOS_SORTEIO = ['acrescimo', 'dataSorteio', 'velocidade'];

function resposta_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

function sorteioFeito_() { return lerAba_('SORTEIOS').length > 0; }

function salvarConfig(obj) {
  var feito = sorteioFeito_();
  var sh = ss_().getSheetByName('CONFIG');
  var linhas = lerAba_('CONFIG');
  Object.keys(obj || {}).forEach(function (k) {
    if (CONFIG_PERMITIDAS.indexOf(k) < 0) throw new Error('Configuração desconhecida: ' + k);
    if (feito && CONFIG_LIVRES_APOS_SORTEIO.indexOf(k) < 0) throw new Error('"' + k + '" não pode mudar após o sorteio');
    var v = String(obj[k]).trim();
    v = v.replace(',', '.');
    if (['parcela', 'acrescimo'].indexOf(k) >= 0 && !(parseFloat(v) >= 0)) throw new Error(k + ' inválido');
    if (k === 'acrescimo' && feito && lerAba_('PARCELAS').some(function (p) { return p.status === 'PAGO'; })) throw new Error('Já há pagamento confirmado; o acréscimo não pode mais mudar');
    if (['meses', 'grupos'].indexOf(k) >= 0 && !(parseInt(v, 10) >= 1)) throw new Error(k + ' inválido');
    if (k === 'inicio' && !/^\d{4}-(0[1-9]|1[0-2])$/.test(v)) throw new Error('inicio deve ser AAAA-MM');
    var idx = -1;
    linhas.forEach(function (r, i) { if (String(r.chave) === k) idx = i; });
    if (idx < 0) sh.appendRow([k, v]); else sh.getRange(idx + 2, 2, 1, 1).setValues([[v]]);
  });
  return lerConfig_();
}

function salvarFeriados(lista) {
  if (sorteioFeito_()) throw new Error('Feriados não podem mudar após o sorteio (as datas das parcelas já foram geradas)');
  var datas = (lista || []).map(function (d) { return String(d).trim(); });
  datas.forEach(function (d) { if (!/^\d{4}-\d{2}-\d{2}$/.test(d)) throw new Error('Data inválida: ' + d); });
  var sh = ss_().getSheetByName('FERIADOS');
  var n = sh.getLastRow() - 1;
  if (n > 0) sh.getRange(2, 1, n, 1).clearContent();
  if (datas.length) sh.getRange(2, 1, datas.length, 1).setValues(datas.map(function (d) { return [d]; }));
  return datas.length;
}

var SLOTS = ['header', 'rodape', 'carrossel'];

function salvarBanner(slot, imagem, link, ordem) {
  if (SLOTS.indexOf(slot) < 0) throw new Error('Local inválido');
  imagem = String(imagem || '').trim(); link = String(link || '').trim();
  if (!/^https:\/\//.test(imagem)) throw new Error('A imagem deve ser um link https://');
  if (link && !/^https:\/\//.test(link)) throw new Error('O link deve começar com https://');
  var lista = lerAba_('BANNERS');
  if (slot !== 'carrossel') removerBannersSlot_(slot);
  var id = novoId_();
  escrever_('BANNERS', [{ id: id, slot: slot, imagem: imagem, link: link, ordem: parseInt(ordem, 10) || lista.length + 1 }]);
  return id;
}

function removerBannersSlot_(slot) {
  lerAba_('BANNERS').forEach(function (b) { if (b.slot === slot) removerBanner(b.id); });
}

function removerBanner(id) {
  var sh = ss_().getSheetByName('BANNERS');
  var n = sh.getLastRow() - 1;
  if (n < 1) return 'ok';
  var ids = sh.getRange(2, 1, n, 1).getValues();
  for (var i = 0; i < n; i++) if (String(ids[i][0]) === String(id)) { sh.deleteRow(i + 2); return 'ok'; }
  return 'ok';
}

function dadosPublicos() {
  var cfg = lerConfig_();
  var sorteados = lerAba_('SORTEIOS').map(function (s) { return { mes: s.mes, grupo: s.grupo, nome: s.nome, premio: premioMes_(cfg, s.mes) }; });
  sorteados.sort(function (a, b) { return a.mes < b.mes ? -1 : a.mes > b.mes ? 1 : Number(a.grupo) - Number(b.grupo); });
  var log = {};
  lerAba_('SORTEIOS').forEach(function (s) { log[s.codigo] = { dataHora: s.dataHora, codigo: s.codigo }; });
  var p = painel();
  return {
    resumo: { parcela: valorParcelaMes_(cfg, p.mes), premio: premioMes_(cfg, p.mes), mes: p.mes, arrecadado: p.resumo.arrecadado, pendente: p.resumo.pendente, inadimplente: p.resumo.inadimplente },
    sorteados: sorteados,
    log: Object.keys(log).map(function (k) { return log[k]; }),
    dataSorteio: cfg.dataSorteio || '',
    velocidade: Number(cfg.velocidade) || 5,
    banners: lerAba_('BANNERS').map(function (b) { return { id: b.id, slot: b.slot, imagem: b.imagem, link: b.link, ordem: Number(b.ordem) || 0 }; })
  };
}

function meusDados_(u) {
  if (!u.participanteId) return { admin: true };
  var p = lerAba_('PARTICIPANTES').filter(function (x) { return String(x.id) === String(u.participanteId); })[0];
  if (!p) throw new Error('Participante não encontrado');
  var hoje = hoje_(), cfg = lerConfig_();
  var parcelas = lerAba_('PARCELAS').filter(function (x) { return String(x.participanteId) === String(p.id); }).map(function (x) {
    return { mes: x.mes, vencimento: x.vencimento, valor: valorParcelaMes_(cfg, x.mes), cor: corParcela(x.status, x.vencimento, hoje) };
  });
  return { nome: p.nome, grupo: p.grupo, ordem: p.ordem, mesRecebimento: p.mesRecebimento, premio: p.mesRecebimento ? premioMes_(cfg, p.mesRecebimento) : 0, parcelas: parcelas };
}

function executarAcao_(d) {
  switch (d.acao) {
    case 'login': return login(d.usuario, d.senha);
    case 'logout': return logout(d.token);
    case 'publico': return dadosPublicos();
    case 'meusDados': return meusDados_(exigirSessao_(d.token));
    case 'painel': exigirSessao_(d.token); return painel(d.mes);
    case 'config': exigirSessao_(d.token, 'admin'); var c = lerConfig_(); c.feriados = Object.keys(lerFeriados_()).sort(); return c;
    case 'salvarConfig': exigirSessao_(d.token, 'admin'); return salvarConfig(d.valores);
    case 'salvarFeriados': exigirSessao_(d.token, 'admin'); return salvarFeriados(d.datas);
    case 'cadastrarParticipante': exigirSessao_(d.token, 'admin'); return cadastrarParticipante(d.nome);
    case 'criarUsuarioParticipante': exigirSessao_(d.token, 'admin'); return criarUsuarioParticipante(d.participanteId, d.usuario, d.senha);
    case 'salvarBanner': exigirSessao_(d.token, 'admin'); return salvarBanner(d.slot, d.imagem, d.link, d.ordem);
    case 'removerBanner': exigirSessao_(d.token, 'admin'); return removerBanner(d.id);
    case 'agendarSorteio': exigirSessao_(d.token, 'admin'); return agendarSorteio();
    case 'realizarSorteio': exigirSessao_(d.token, 'admin'); return realizarSorteio();
    case 'confirmarPagamento': exigirSessao_(d.token, 'admin'); return confirmarPagamento(d.parcelaId);
    default: throw new Error('Ação desconhecida');
  }
}

function doPost(e) {
  try {
    var d = JSON.parse(e.postData.contents);
    return resposta_({ ok: true, dados: executarAcao_(d) });
  } catch (err) {
    return resposta_({ ok: false, erro: err.message });
  }
}

function doGet(e) {
  try { return resposta_({ ok: true, dados: dadosPublicos() }); }
  catch (err) { return resposta_({ ok: false, erro: err.message }); }
}

function testeApi() {
  var r = [];
  function t(nome, ok) { r.push((ok ? 'OK   ' : 'FALHOU ') + nome); }
  setup();
  var salt = 'abc';
  t('hash de senha é determinístico', hashSenha_('segredo', salt) === hashSenha_('segredo', salt) && hashSenha_('segredo', salt) !== hashSenha_('segredo2', salt));
  var pub = dadosPublicos();
  t('dados públicos', pub && pub.resumo && Array.isArray(pub.sorteados) && Array.isArray(pub.log));
  var out = JSON.parse(doGet({}).getContent());
  t('doGet responde JSON', out.ok === true);
  var neg = JSON.parse(doPost({ postData: { contents: JSON.stringify({ acao: 'painel', token: 'x' }) } }).getContent());
  t('painel sem sessão é recusado', neg.ok === false);
  Logger.log(r.join('\n'));
  return r.join('\n');
}
