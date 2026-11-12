// 전체화면 버튼 + 부스 모드
// - 모든 기기: 위쪽 바에 [전체화면] 버튼이 생깁니다.
// - 부스 모드: 주소 끝에 ?booth=1 을 붙여 한 번 열면 이 기기에 기억됩니다.
//   화면을 터치할 때마다 전체화면으로 돌아가고, 뒤로 가기·길게 누르기·당겨서 새로고침을 막습니다.
//   끄려면 주소 끝에 ?booth=0 을 붙여 한 번 열면 됩니다.
(function () {
  const KEY = 'strategy-ttt-booth';
  const d = document, root = d.documentElement;
  const q = new URLSearchParams(location.search).get('booth');
  try { if (q === '1') localStorage.setItem(KEY, '1'); if (q === '0') localStorage.removeItem(KEY); } catch (e) {}
  let booth = false;
  try { booth = localStorage.getItem(KEY) === '1'; } catch (e) {}

  const req = root.requestFullscreen || root.webkitRequestFullscreen;
  const canFS = !!req && (d.fullscreenEnabled !== false) && (d.webkitFullscreenEnabled !== false);
  const isFS = () => !!(d.fullscreenElement || d.webkitFullscreenElement);
  function enter() {
    if (!canFS || isFS()) return;
    try { const p = req.call(root, { navigationUI: 'hide' }); if (p && p.catch) p.catch(() => {}); } catch (e) {}
  }
  function exit() {
    const f = d.exitFullscreen || d.webkitExitFullscreen;
    if (f && isFS()) { try { const p = f.call(d); if (p && p.catch) p.catch(() => {}); } catch (e) {} }
  }

  function addButtons() {
    if (!canFS || booth) return;
    d.querySelectorAll('.topbar').forEach(bar => {
      const last = bar.lastElementChild; if (!last) return;
      const group = d.createElement('span'); group.className = 'topbar-group';
      const b = d.createElement('button');
      b.type = 'button'; b.className = 'icon-button fs-button';
      b.addEventListener('click', e => { e.stopPropagation(); isFS() ? exit() : enter(); });
      bar.replaceChild(group, last); group.append(b, last);
    });
    sync();
  }
  function sync() {
    d.querySelectorAll('.fs-button').forEach(b => {
      const on = isFS();
      b.textContent = on ? '창 모드' : '전체화면';
      b.setAttribute('aria-label', on ? '전체화면 끄기' : '전체화면 켜기');
    });
  }
  d.addEventListener('fullscreenchange', sync);
  d.addEventListener('webkitfullscreenchange', sync);

  function boothMode() {
    root.classList.add('booth');
    // 터치할 때마다 전체화면 유지 (브라우저는 터치 없이는 전체화면을 허락하지 않아요)
    const again = () => enter();
    d.addEventListener('pointerup', again, true);
    d.addEventListener('click', again, true);
    // 길게 눌러 나오는 메뉴(복사, 링크 열기 등) 막기
    d.addEventListener('contextmenu', e => e.preventDefault());
    // 뒤로 가기(버튼·제스처)를 누르면 페이지를 떠나지 않고 게임의 뒤로 동작만 실행
    history.pushState({ booth: 1 }, '');
    window.addEventListener('popstate', () => {
      history.pushState({ booth: 1 }, '');
      d.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }));
    });
    // 첫 화면 안내
    if (canFS && !isFS()) {
      const tip = d.createElement('div');
      tip.className = 'booth-tip'; tip.textContent = '화면을 한 번 터치하면 전체화면으로 바뀌어요';
      d.body.appendChild(tip);
      const hide = () => { tip.remove(); d.removeEventListener('pointerup', hide, true); };
      d.addEventListener('pointerup', hide, true);
    }
  }

  if (d.readyState === 'loading') d.addEventListener('DOMContentLoaded', init); else init();
  function init() { addButtons(); if (booth) boothMode(); }
})();
