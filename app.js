'use strict';
(() => {
  const papers = window.PUBLICATIONS || [];
  const zh = document.documentElement.lang.startsWith('zh');
  const t = (en, cn) => zh ? cn : en;
  const summary = p => zh ? (p.summaryZh || p.summary) : p.summary;
  const status = p => zh ? ({Accepted:'已录用', Published:'已发表', Preprint:'预印本', 'Submitted to arXiv':'已提交 arXiv'}[p.status] || p.status) : p.status;
  const venue = p => zh ? (p.venueZh || p.venue) : p.venue;
  const searchAliases = {manuscript:'稿件', reconstruction:'三维重建 重建', robotics:'机器人 协同感知', watermarking:'水印 数字水印', learning:'学习 博弈'};
  const linkLabel = label => zh ? ({Paper:'论文', PDF:'PDF', Code:'代码', Project:'项目主页', Publisher:'出版页面'}[label] || label) : label;
  document.querySelectorAll('.language-switch a').forEach(link => {
    link.addEventListener('click', () => { link.hash = window.location.hash; });
  });
  const list = document.getElementById('paper-list');
  const search = document.getElementById('paper-search');
  const dialog = document.getElementById('paper-dialog');
  const content = document.getElementById('dialog-content');
  let activeFilter = 'all';
  let toastTimer;
  const escapeHTML = value => String(value || '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const safeURL = url => {try {const parsed = new URL(url, document.baseURI);return ['https:','http:'].includes(parsed.protocol) ? parsed.href : '';} catch {return '';}};
  const authorsHTML = p => escapeHTML(p.authorsDisplay || p.authors.join(', ')).replaceAll('Tianyu Xiong','<strong>Tianyu Xiong</strong>');
  document.getElementById('archive-total').textContent = `${String(papers.length).padStart(2,'0')} ${t('RECORDS', '篇论文')}`;
  function render() {
    const query = search.value.trim().toLowerCase();
    const filtered = papers.filter(p => (activeFilter === 'all' || p.category === activeFilter) && `${p.id} ${p.title} ${p.authors.join(' ')} ${p.venue} ${p.summary} ${p.summaryZh || ''} ${p.category} ${searchAliases[p.category] || ''} 熊天宇 ${p.year}`.toLowerCase().includes(query));
    document.getElementById('results-summary').textContent = zh ? `共 ${papers.length} 篇，${query ? '匹配' : '显示'} ${filtered.length} 篇` : `${filtered.length} of ${papers.length} records${query ? ' matching your search' : ''}`;
    list.innerHTML = filtered.length ? filtered.map(p => {
      const primary = p.links.find(l => safeURL(l.url));
      return `<article class="paper" id="paper-${escapeHTML(p.id)}"><span class="paper-number">${String(papers.indexOf(p)+1).padStart(2,'0')}</span><div class="paper-body"><div class="paper-meta"><span>${escapeHTML(p.year)} / ${escapeHTML(venue(p))}</span><span class="paper-status">${escapeHTML(status(p))}</span></div><h3><button lang="en" data-open="${escapeHTML(p.id)}">${escapeHTML(p.title)}</button></h3><p class="paper-authors" lang="en">${authorsHTML(p)}</p>${summary(p) ? `<p class="paper-summary">${escapeHTML(summary(p))}</p>` : ''}</div><div class="paper-actions"><button class="record-open" data-open="${escapeHTML(p.id)}">${t('View record', '查看详情')} ↗</button>${primary ? `<a href="${escapeHTML(safeURL(primary.url))}" target="_blank" rel="noopener noreferrer">${escapeHTML(linkLabel(primary.label))} ↗</a>` : ''}<button data-cite="${escapeHTML(p.id)}" aria-label="${t('Copy citation for', '复制引用：')} ${escapeHTML(p.title)}">${t('Copy BibTeX', '复制 BibTeX')}</button></div></article>`;
    }).join('') : `<div class="empty-state"><p>${t('No papers match this search.', '没有找到匹配的论文。')}</p><button id="clear-search">${t('Reset filters', '重置筛选')}</button></div>`;
  }
  function openPaper(id) {
    const p = papers.find(p => p.id === id); if (!p) return;
    content.innerHTML = `<div class="paper-meta"><span>${escapeHTML(p.year)} / ${escapeHTML(venue(p))}</span><span class="paper-status">${escapeHTML(status(p))}</span></div><h2 id="dialog-title" lang="en">${escapeHTML(p.title)}</h2><p class="dialog-authors" lang="en">${authorsHTML(p)}</p>${summary(p) ? `<p class="dialog-summary">${escapeHTML(summary(p))}</p>` : ''}<div class="dialog-links">${p.links.filter(l => safeURL(l.url)).map(l => `<a href="${escapeHTML(safeURL(l.url))}" target="_blank" rel="noopener noreferrer">${escapeHTML(linkLabel(l.label))} ↗</a>`).join('')}</div><div class="citation-heading"><span>${t('BIBTEX CITATION', 'BIBTEX 引用')}</span><button class="copy-citation" data-cite="${escapeHTML(p.id)}">${t('Copy citation', '复制引用')}</button></div><pre class="citation-text" lang="en">${escapeHTML(p.bibtex)}</pre>${p.note ? `<p class="metadata-note">${escapeHTML(zh ? (p.noteZh || p.note) : p.note)}</p>` : ''}`;
    dialog.showModal(); document.body.style.overflow = 'hidden';
  }
  function toast(message) {const el = document.getElementById('toast');el.textContent = message;el.classList.add('visible');clearTimeout(toastTimer);toastTimer = setTimeout(() => el.classList.remove('visible'),2800);}
  async function copyCitation(id) {
    const p = papers.find(p => p.id === id); if (!p) return;
    try {await navigator.clipboard.writeText(p.bibtex);toast(t('BibTeX citation copied.', '已复制 BibTeX 引用。'));}
    catch {
      const textarea = document.createElement('textarea');textarea.value = p.bibtex;textarea.style.position='fixed';textarea.style.opacity='0';(dialog.open ? content : document.body).append(textarea);textarea.select();
      let copied = false;try {copied = document.execCommand('copy');} catch {}textarea.remove();
      if(copied) toast(t('BibTeX citation copied.', '已复制 BibTeX 引用。')); else {if(!dialog.open) openPaper(id);toast(t('Select and copy the citation in the record.', '请在详情中选中并复制引用。'));}
    }
  }
  document.addEventListener('click', e => {
    const open = e.target.closest('[data-open]');if(open) openPaper(open.dataset.open);
    const cite = e.target.closest('[data-cite]');if(cite) copyCitation(cite.dataset.cite);
    const filter = e.target.closest('[data-filter]');if(filter){activeFilter=filter.dataset.filter;document.querySelectorAll('[data-filter]').forEach(b=>{const active=b===filter;b.classList.toggle('active',active);b.setAttribute('aria-pressed',String(active));});render();}
    if(e.target.closest('#clear-search')){search.value='';document.querySelector('[data-filter="all"]').click();search.focus();}
  });
  search.addEventListener('input', render);
  document.getElementById('dialog-close').addEventListener('click',()=>dialog.close());
  dialog.addEventListener('close',()=>document.body.style.overflow='');
  dialog.addEventListener('click',e=>{if(e.target===dialog){const r=dialog.getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)dialog.close();}});
  document.addEventListener('keydown',e=>{if(e.key==='/'&&!dialog.open&&!['INPUT','TEXTAREA'].includes(document.activeElement.tagName)&&!document.activeElement.isContentEditable){e.preventDefault();document.getElementById('publications').scrollIntoView({behavior:matchMedia('(prefers-reduced-motion: reduce)').matches?'instant':'smooth'});search.focus({preventScroll:true});}});
  render();
})();
