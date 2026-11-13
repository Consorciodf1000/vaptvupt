(function () {
  var API = window.VAPT_CONFIG.API_URL;
  var S = { tok: sessionStorage.getItem('tok') || '', papel: sessionStorage.getItem('papel') || '', nome: sessionStorage.getItem('nome') || '', pub: null, aba: 'inicio', mes: '' };
  var $ = function (id) { return document.getElementById(id); };
  var carTimer = null, animTimer = null;

  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function moeda(v) { return Number(v || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }); }
  function dt(s) { s = String(s || ''); return s.length >= 10 ? s.substr(8, 2) + '/' + s.substr(5, 2) + '/' + s.substr(0, 4) : s; }
  function mm(s) { s = String(s || ''); return s.substr(5, 2) + '/' + s.substr(0, 4); }
  function toast(m) { var t = $('toast'); t.textContent = m; t.style.display = 'block'; clearTimeout(toast.t); toast.t = setTimeout(function () { t.style.display = 'none'; }, 3500); }
  function api(acao, d) {
    d = Object.assign({ acao: acao, token: S.tok }, d || {});
    return fetch(API, { method: 'POST', body: JSON.stringify(d) }).then(function (r) { return r.json(); }).then(function (j) { if (!j.ok) throw new Error(j.erro); return j.dados; });
  }
  function falha(e) { toast(e.message); if (/Sessão/.test(e.message)) sair(true); }
  function sair(silencioso) {
    if (S.tok && !silencioso) api('logout').catch(function () {});
    S.tok = ''; S.papel = ''; S.nome = ''; sessionStorage.clear(); S.aba = 'inicio'; fixos(); render();
  }
  function listaMeses(ini, n) { var a = +ini.substr(0, 4), m = +ini.substr(5, 2), r = []; for (var i = 0; i < n; i++) { r.push(a + '-' + (m < 10 ? '0' : '') + m); m++; if (m > 12) { m = 1; a++; } } return r; }
  function admin() { return S.papel === 'admin'; }

  /* ---------- áreas fixas ---------- */
  function banners(slot) { return (S.pub.banners || []).filter(function (b) { return b.slot === slot; }).sort(function (a, b) { return a.ordem - b.ordem; }); }
  function imgHtml(b) { var i = '<img src="' + esc(b.imagem) + '" alt="propaganda">'; return b.link ? '<a href="' + esc(b.link) + '" target="_blank" rel="noopener">' + i + '</a>' : i; }
  function fixos() {
    var p = S.pub; if (!p) return;
    var r = p.resumo;
    $('nav').innerHTML = '<span>Parcela: <b>' + moeda(r.parcela) + '</b></span><span>Prêmio: <b>' + moeda(r.premio) + '</b></span><span>Arrecadado (' + mm(r.mes) + '): <b>' + moeda(r.arrecadado) + '</b></span><span>Pendente: <b>' + moeda(r.pendente) + '</b></span><span>Inadimplente: <b>' + moeda(r.inadimplente) + '</b></span>';
    var porMes = {};
    p.sorteados.forEach(function (s) { (porMes[s.mes] = porMes[s.mes] || []).push('G' + s.grupo + ' ' + esc(s.nome)); });
    var h = '<h3>Sorteados</h3>';
    Object.keys(porMes).sort().forEach(function (m) { h += '<p class="sort"><b>' + mm(m) + '</b><br>' + porMes[m].join('<br>') + '</p>'; });
    if (!p.sorteados.length) h += '<p class="mut">Sorteio ainda não realizado.' + (p.dataSorteio ? '<br>Agendado: ' + esc(p.dataSorteio) : '') + '</p>';
    $('esq').innerHTML = h;
    var bh = banners('header')[0], br = banners('rodape')[0];
    $('adHeader').innerHTML = bh ? imgHtml(bh) : ''; $('adRodape').innerHTML = br ? imgHtml(br) : '';
    var car = banners('carrossel'), i = 0; clearInterval(carTimer);
    function mostra() { $('carrossel').innerHTML = car.length ? imgHtml(car[i % car.length]) : ''; i++; }
    mostra(); if (car.length > 1) carTimer = setInterval(mostra, Math.max(2, p.velocidade || 5) * 1000);
    $('user').innerHTML = S.tok ? esc(S.nome) + ' <button class="sec" id="bSair">Sair</button>' : '';
    if (S.tok) $('bSair').onclick = function () { sair(); };
  }
  function carregarPub() { return api('publico').then(function (p) { S.pub = p; fixos(); return p; }); }

  /* ---------- telas ---------- */
  var ABAS = { inicio: 'Início', meus: 'Meus dados', painel: 'Painel', part: 'Participantes', sorteio: 'Sorteio', cfg: 'Configurações', ads: 'Propagandas' };
  function render() {
    var lista = !S.tok ? ['inicio'] : admin() ? ['inicio', 'painel', 'part', 'sorteio', 'cfg', 'ads'] : ['inicio', 'meus', 'painel'];
    if (lista.indexOf(S.aba) < 0) S.aba = 'inicio';
    $('app').innerHTML = '<div class="tabs">' + lista.map(function (a) { return '<button class="' + (a === S.aba ? 'on' : '') + '" data-a="' + a + '">' + ABAS[a] + '</button>'; }).join('') + '</div><div id="tela"></div>';
    Array.prototype.forEach.call($('app').querySelectorAll('[data-a]'), function (b) { b.onclick = function () { S.aba = b.getAttribute('data-a'); render(); }; });
    ({ inicio: vInicio, meus: vMeus, painel: vPainel, part: vPart, sorteio: vSorteio, cfg: vCfg, ads: vAds })[S.aba]();
  }

  function vInicio() {
    var p = S.pub, h = '';
    if (!S.tok) h += '<div class="card"><h2>Entrar</h2><input id="u" placeholder="Usuário"> <input id="s" type="password" placeholder="Senha"> <button id="bLogin">Entrar</button></div>';
    h += '<div class="card"><h2>Transparência do sorteio</h2>';
    if (p && p.log.length) {
      p.log.forEach(function (l) { h += '<p class="mut">Realizado em ' + esc(l.dataHora) + '<br>Código de verificação: ' + esc(l.codigo) + '</p>'; });
      h += '<button id="bVer">Assistir ao sorteio</button>';
    } else h += '<p class="mut">O sorteio ainda não foi realizado.' + (p && p.dataSorteio ? ' Agendado para ' + esc(p.dataSorteio) + '. Mantenha esta página aberta para acompanhar.' : '') + '</p>';
    $('tela').innerHTML = h + '</div>';
    if ($('bLogin')) $('bLogin').onclick = function () {
      api('login', { usuario: $('u').value, senha: $('s').value }).then(function (r) {
        S.tok = r.token; S.papel = r.papel; S.nome = r.usuario;
        sessionStorage.setItem('tok', S.tok); sessionStorage.setItem('papel', S.papel); sessionStorage.setItem('nome', S.nome);
        S.aba = admin() ? 'painel' : 'meus'; fixos(); render();
      }).catch(falha);
    };
    if ($('bVer')) $('bVer').onclick = function () { animar(); };
  }

  function chips(lista) { return '<div class="chips">' + lista + '</div>'; }
  var LEG = '<p class="legenda"><span class="amarelo">Pendente</span><span class="verde">Pago</span><span class="vermelho">Inadimplente</span></p>';

  function vMeus() {
    api('meusDados').then(function (d) {
      if (d.admin) { $('tela').innerHTML = '<p>Você está como administrador.</p>'; return; }
      var h = '<div class="card"><h2>' + esc(d.nome) + '</h2>';
      h += d.mesRecebimento ? '<p>Grupo <b>' + esc(d.grupo) + '</b> · Você recebe em <b>' + mm(d.mesRecebimento) + '</b></p>' : '<p class="mut">O sorteio ainda não foi realizado.</p>';
      h += LEG + chips(d.parcelas.map(function (x) { return '<span class="chip ' + x.cor + '">' + mm(x.mes) + ' · vence ' + dt(x.vencimento) + ' · ' + moeda(x.valor) + '</span>'; }).join('')) + '</div>';
      $('tela').innerHTML = h;
    }).catch(falha);
  }

  function vPainel() {
    var meses = {}; S.pub.sorteados.forEach(function (s) { meses[s.mes] = 1; });
    var ms = Object.keys(meses).sort();
    if (ms.length && ms.indexOf(S.mes) < 0) S.mes = '';
    api('painel', S.mes ? { mes: S.mes } : {}).then(function (d) {
      S.mes = d.mes; if (ms.indexOf(d.mes) < 0) ms.push(d.mes); ms.sort();
      var h = '<h2>Pagamentos</h2><select id="selMes">' + ms.map(function (m) { return '<option value="' + m + '"' + (m === d.mes ? ' selected' : '') + '>' + mm(m) + '</option>'; }).join('') + '</select>' + LEG;
      Object.keys(d.grupos).sort().forEach(function (g) {
        h += '<div class="grupo"><h3>' + (g === '0' ? 'Participantes (aguardando sorteio)' : 'Grupo ' + g) + '</h3>' + chips(d.grupos[g].map(function (x) {
          var pode = admin() && x.parcelaId && x.cor !== 'verde';
          return '<span class="chip ' + x.cor + '"' + (pode ? ' data-p="' + esc(x.parcelaId) + '" style="cursor:pointer" title="Clique para confirmar pagamento"' : '') + '>' + esc(x.nome) + (x.vencimento ? ' · ' + dt(x.vencimento) : '') + (x.valor ? ' · ' + moeda(x.valor) : '') + '</span>';
        }).join('')) + '</div>';
      });
      if (admin()) h += '<p class="mut">Clique em um participante amarelo ou vermelho para confirmar o pagamento.</p>';
      $('tela').innerHTML = h;
      $('selMes').onchange = function () { S.mes = this.value; vPainel(); };
      Array.prototype.forEach.call($('tela').querySelectorAll('[data-p]'), function (c) {
        c.onclick = function () { if (confirm('Confirmar pagamento de ' + c.textContent.split(' · ')[0] + '?')) api('confirmarPagamento', { parcelaId: c.getAttribute('data-p') }).then(function () { toast('Pagamento confirmado'); return carregarPub(); }).then(vPainel).catch(falha); };
      });
    }).catch(falha);
  }

  function vPart() {
    api('painel', {}).then(function (d) {
      var todos = []; Object.keys(d.grupos).forEach(function (g) { todos = todos.concat(d.grupos[g]); });
      var h = '<h2>Participantes (' + todos.length + ')</h2><input id="nm" placeholder="Nome do participante"> <button id="bAdd">Cadastrar</button>';
      todos.forEach(function (x) { h += '<div class="card">' + esc(x.nome) + ' <button class="sec" data-id="' + esc(x.id) + '">Criar acesso</button></div>'; });
      $('tela').innerHTML = h;
      $('bAdd').onclick = function () { api('cadastrarParticipante', { nome: $('nm').value }).then(function () { toast('Cadastrado'); vPart(); }).catch(falha); };
      Array.prototype.forEach.call($('tela').querySelectorAll('[data-id]'), function (b) {
        b.onclick = function () {
          var u = prompt('Usuário de acesso (mín. 3 caracteres):'); if (!u) return;
          var s = prompt('Senha (mín. 6 caracteres):'); if (!s) return;
          api('criarUsuarioParticipante', { participanteId: b.getAttribute('data-id'), usuario: u, senha: s }).then(function () { toast('Acesso criado'); }).catch(falha);
        };
      });
    }).catch(falha);
  }

  function vSorteio() {
    api('config').then(function (c) {
      var feito = S.pub.log.length > 0;
      var h = '<h2>Sorteio</h2>';
      if (feito) h += '<p>O sorteio já foi realizado.</p>';
      else {
        h += '<div class="card"><h3>Agendar</h3><input id="dh" type="datetime-local"> <button id="bAg">Salvar e agendar</button><p class="mut">Agendado: ' + esc(c.dataSorteio || 'nenhum') + '</p></div>';
        h += '<div class="card"><h3>Realizar agora</h3><button class="ok" id="bAgora">Realizar sorteio agora</button></div>';
      }
      $('tela').innerHTML = h;
      if (feito) return;
      $('bAg').onclick = function () {
        var v = $('dh').value.replace('T', ' '); if (!v) return toast('Escolha a data e a hora');
        api('salvarConfig', { valores: { dataSorteio: v } }).then(function () { return api('agendarSorteio'); }).then(function (m) { toast(m); vSorteio(); }).catch(falha);
      };
      $('bAgora').onclick = function () {
        if (!confirm('Realizar o sorteio agora? Não poderá ser refeito.')) return;
        api('realizarSorteio').then(function () { return carregarPub(); }).then(function () { render(); animar(); }).catch(falha);
      };
    }).catch(falha);
  }

  var CAMPOS = [['parcela', 'Valor da parcela (R$)'], ['premio', 'Prêmio mensal por grupo (R$)'], ['inicio', 'Mês de início (AAAA-MM)'], ['meses', 'Quantidade de meses'], ['grupos', 'Quantidade de grupos'], ['velocidade', 'Velocidade do carrossel (segundos)']];
  function vCfg() {
    api('config').then(function (c) {
      var h = '<h2>Configurações</h2>' + CAMPOS.map(function (f) { return '<p><label>' + f[1] + '<br><input data-k="' + f[0] + '" value="' + esc(c[f[0]]) + '"></label></p>'; }).join('');
      h += '<p><label>Feriados (um por linha, AAAA-MM-DD)<br><textarea id="fer" rows="6">' + esc((c.feriados || []).join('\n')) + '</textarea></label></p><button id="bSalva">Salvar</button><p class="mut">Depois do sorteio, só prêmio, data e velocidade podem mudar.</p>';
      h += '<h3>Acréscimo mensal (valor somado à parcela de todos no mês)</h3>' + listaMeses(c.inicio, parseInt(c.meses, 10) || 0).map(function (m) { return '<p><label>' + mm(m) + ' · R$ <input data-m="' + m + '" value="' + esc((c.acrescimos || {})[m] || 0) + '" size="8"></label></p>'; }).join('') + '<button id="bAcr">Salvar acréscimos</button><p class="mut">Um mês com pagamento confirmado não pode mais mudar.</p>';
      $('tela').innerHTML = h;
      $('bAcr').onclick = function () {
        var cadeia = Promise.resolve();
        Array.prototype.forEach.call($('tela').querySelectorAll('[data-m]'), function (i) {
          var m = i.getAttribute('data-m');
          if (Number(String(i.value).replace(',', '.')) === Number((c.acrescimos || {})[m] || 0)) return;
          cadeia = cadeia.then(function () { return api('salvarAcrescimo', { mes: m, valor: i.value }); });
        });
        cadeia.then(function () { toast('Acréscimos salvos'); return carregarPub(); }).then(vCfg).catch(falha);
      };
      $('bSalva').onclick = function () {
        var v = {}; Array.prototype.forEach.call($('tela').querySelectorAll('[data-k]'), function (i) { v[i.getAttribute('data-k')] = i.value; });
        var fer = $('fer').value.split('\n').map(function (x) { return x.trim(); }).filter(Boolean);
        var feito = S.pub.log.length > 0;
        if (feito) v = { premio: v.premio, velocidade: v.velocidade };
        api('salvarConfig', { valores: v }).then(function () { return feito ? 0 : api('salvarFeriados', { datas: fer }); }).then(function () { toast('Salvo'); return carregarPub(); }).catch(falha);
      };
    }).catch(falha);
  }

  function vAds() {
    var h = '<h2>Propagandas</h2><p class="mut">Use links https:// de imagens já publicadas.</p>';
    [['header', 'Topo (header)'], ['rodape', 'Rodapé']].forEach(function (s) {
      var b = banners(s[0])[0];
      h += '<div class="card"><h3>' + s[1] + '</h3><input data-s="' + s[0] + '" data-f="imagem" placeholder="Link da imagem" value="' + esc(b ? b.imagem : '') + '"> <input data-s="' + s[0] + '" data-f="link" placeholder="Link de destino (opcional)" value="' + esc(b ? b.link : '') + '"> <button data-salva="' + s[0] + '">Salvar</button>' + (b ? ' <button class="sec" data-rem="' + esc(b.id) + '">Remover</button>' : '') + '</div>';
    });
    h += '<div class="card"><h3>Carrossel (lateral direita)</h3>';
    banners('carrossel').forEach(function (b) { h += '<p class="mut">' + esc(b.imagem) + ' <button class="sec" data-rem="' + esc(b.id) + '">Remover</button></p>'; });
    h += '<input data-s="carrossel" data-f="imagem" placeholder="Link da imagem"> <input data-s="carrossel" data-f="link" placeholder="Link de destino (opcional)"> <button data-salva="carrossel">Adicionar</button></div>';
    $('tela').innerHTML = h;
    function recarrega() { return carregarPub().then(vAds); }
    Array.prototype.forEach.call($('tela').querySelectorAll('[data-salva]'), function (b) {
      b.onclick = function () {
        var s = b.getAttribute('data-salva'), v = {};
        Array.prototype.forEach.call($('tela').querySelectorAll('[data-s="' + s + '"]'), function (i) { v[i.getAttribute('data-f')] = i.value; });
        api('salvarBanner', { slot: s, imagem: v.imagem, link: v.link }).then(function () { toast('Salvo'); return recarrega(); }).catch(falha);
      };
    });
    Array.prototype.forEach.call($('tela').querySelectorAll('[data-rem]'), function (b) {
      b.onclick = function () { api('removerBanner', { id: b.getAttribute('data-rem') }).then(recarrega).catch(falha); };
    });
  }

  /* ---------- animação do sorteio (replay do resultado já gravado) ---------- */
  function animar() {
    var p = S.pub, passos = p.sorteados.slice(); if (!passos.length) return;
    var nomes = passos.map(function (s) { return s.nome; }), el = $('sorteio'), i = 0, hist = '';
    var info = p.log[0] ? 'Sorteio de ' + esc(p.log[0].dataHora) + '<br>Código: ' + esc(p.log[0].codigo) : '';
    el.hidden = false;
    function fecha() { clearInterval(animTimer); clearTimeout(animTimer); el.hidden = true; }
    function cx(rol, fixo, fim) {
      el.innerHTML = '<div class="caixa"><h2>Sorteio ao vivo</h2><div class="mut">' + info + '</div>' +
        (fim ? '<h3>Sorteio concluído</h3>' : '<p>Mês <b>' + mm(passos[i].mes) + '</b> · Grupo <b>' + passos[i].grupo + '</b></p><div class="roleta' + (fixo ? ' fixo' : '') + '">' + esc(rol) + '</div>') +
        '<div class="hist">' + hist + '</div><button id="bSkip" class="sec">' + (fim ? 'Fechar' : 'Pular animação') + '</button></div>';
      $('bSkip').onclick = function () { if (fim) fecha(); else { clearInterval(animTimer); clearTimeout(animTimer); passos.forEach(function (s, k) { if (k >= i) hist += '<p>' + mm(s.mes) + ' · Grupo ' + s.grupo + ': <b>' + esc(s.nome) + '</b></p>'; }); cx('', true, true); } };
    }
    function passo() {
      if (i >= passos.length) return cx('', true, true);
      var t = 0; cx(nomes[0], false);
      animTimer = setInterval(function () {
        t += 70; var r = $('sorteio').querySelector('.roleta'); if (!r) return;
        if (t < 1400) r.textContent = nomes[Math.floor(Math.random() * nomes.length)];
        else {
          clearInterval(animTimer); cx(passos[i].nome, true);
          hist += '<p>' + mm(passos[i].mes) + ' · Grupo ' + passos[i].grupo + ': <b>' + esc(passos[i].nome) + '</b></p>'; i++;
          animTimer = setTimeout(passo, 900);
        }
      }, 70);
    }
    passo();
  }

  /* ---------- início ---------- */
  carregarPub().then(function () { render(); }).catch(function (e) { $('app').innerHTML = '<p>Não foi possível carregar: ' + esc(e.message) + '</p>'; });
  setInterval(function () {
    var antes = S.pub ? S.pub.sorteados.length : -1;
    carregarPub().then(function (p) { if (antes === 0 && p.sorteados.length > 0) { render(); animar(); } }).catch(function () {});
  }, 20000);
})();
