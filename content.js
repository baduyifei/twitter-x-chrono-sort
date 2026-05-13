(() => {
  'use strict';

  const LOG = (...a) => console.log('[X Chrono Sort]', ...a);

  // ====================================================================
  // State
  // 排序模式：'off' | 'newest' | 'oldest'
  // 页面类型：'profile' | 'status' | 'other'
  // ====================================================================
  const state = {
    mode: 'off',
    pageType: 'other',
  };

  // ====================================================================
  // 页面类型检测
  // Twitter/X 系统保留路径（这些路径下的"用户名段"不是真实用户名）
  // ====================================================================
  const RESERVED_TOP_LEVEL = new Set([
    'home', 'explore', 'notifications', 'messages', 'bookmarks',
    'lists', 'communities', 'jobs', 'premium_sign_up', 'premium',
    'i', 'settings', 'compose', 'search', 'login', 'logout', 'signup',
    'account', 'flow', 'tos', 'privacy', 'rules', 'about', 'help',
    'support', 'share', 'intent', 'display', 'download', 'topics',
    'analytics', 'media_studio', 'media-studio',
    'verified_choose', 'verified-choose', 'verified-orgs',
    'following', 'followers',
  ]);

  // 用户主页允许的子路径后缀
  const PROFILE_SUFFIX = new Set([
    'with_replies', 'media', 'likes', 'articles', 'highlights',
    'affiliates', 'following', 'followers',
    'followers_you_follow', 'verified_followers', 'creator-subscriptions',
  ]);

  function detectPageType(pathname = location.pathname) {
    // 推文详情：/username/status/123456[/photo/1|/video/1]
    const statusMatch = pathname.match(/^\/([^/]+)\/status\/\d+(?:\/(?:photo|video)\/\d+)?\/?$/);
    if (statusMatch && !RESERVED_TOP_LEVEL.has(statusMatch[1].toLowerCase())) {
      return 'status';
    }

    // 用户主页：/username 或 /username/<allowed-suffix>
    const profileMatch = pathname.match(/^\/([^/]+)(?:\/([^/]+))?\/?$/);
    if (profileMatch) {
      const seg1 = profileMatch[1].toLowerCase();
      const seg2 = profileMatch[2]?.toLowerCase();
      if (!RESERVED_TOP_LEVEL.has(seg1)) {
        // 单段（/elonmusk）或允许的两段（/elonmusk/media）
        if (!seg2 || PROFILE_SUFFIX.has(seg2)) {
          return 'profile';
        }
      }
    }

    return 'other';
  }

  // ====================================================================
  // SPA 路由变化监听
  // Twitter 是 SPA，URL 变化不会触发 navigation，需要主动监听。
  // 三重保险：hook pushState/replaceState + popstate + 轮询兜底
  // ====================================================================
  function observeRouteChanges(onChange) {
    let lastUrl = location.href;

    const fire = (source) => {
      if (location.href !== lastUrl) {
        const prev = lastUrl;
        lastUrl = location.href;
        onChange(prev, lastUrl, source);
      }
    };

    const origPush = history.pushState;
    history.pushState = function (...args) {
      const r = origPush.apply(this, args);
      fire('pushState');
      return r;
    };

    const origReplace = history.replaceState;
    history.replaceState = function (...args) {
      const r = origReplace.apply(this, args);
      fire('replaceState');
      return r;
    };

    window.addEventListener('popstate', () => fire('popstate'));

    // 轮询兜底（极少数情况下 history hook 被覆盖）
    setInterval(() => fire('poll'), 500);
  }

  // ====================================================================
  // 时间线排序核心
  // ====================================================================
  const SEL_CELL = '[data-testid="cellInnerDiv"]';
  const SEL_TWEET = 'article[data-testid="tweet"]';
  const SENTINEL_END = 2_000_000_000;          // 无时间戳 cell 排到末尾
  const ORIGINAL_SENTINEL = -2_147_483_647;    // 详情页楼主推文恒在最顶（int32 近最小值）

  // 当前被我们接管的时间线容器 + 对应的 MutationObserver
  let activeContainer = null;
  let activeObserver = null;

  function getCellTimestamp(cell) {
    const t = cell.querySelector('time[datetime]');
    if (!t) return null;
    const ms = Date.parse(t.getAttribute('datetime'));
    if (Number.isNaN(ms)) return null;
    return Math.floor(ms / 1000); // 秒级，避免 CSS order int32 溢出
  }

  // 详情页楼主推文识别：Twitter 给主推 article 设 tabindex="-1"，回复是 "0"
  function isOriginalTweet(cell) {
    if (state.pageType !== 'status') return false;
    const article = cell.querySelector(SEL_TWEET);
    return article?.getAttribute('tabindex') === '-1';
  }

  function applyCellOrder(cell, mode) {
    if (isOriginalTweet(cell)) {
      cell.style.order = String(ORIGINAL_SENTINEL);
      return;
    }
    const ts = getCellTimestamp(cell);
    if (ts === null) {
      cell.style.order = String(mode === 'newest' ? 0 : SENTINEL_END);
      return;
    }
    cell.style.order = String(mode === 'newest' ? -ts : ts);
  }

  function findTimelineContainer() {
    const firstCell = document.querySelector(SEL_CELL);
    if (!firstCell) return null;
    const parent = firstCell.parentElement;
    if (!parent) return null;
    if (parent.querySelectorAll(SEL_CELL).length < 1) return null;
    return parent;
  }

  function sortTimeline() {
    const container = findTimelineContainer();
    if (!container) {
      LOG('timeline container not found yet');
      return;
    }

    // 切换容器时先清理旧容器
    if (activeContainer && activeContainer !== container) {
      unsortTimeline();
    }
    activeContainer = container;
    container.classList.add('xcs-sorted');

    for (const cell of container.querySelectorAll(SEL_CELL)) {
      applyCellOrder(cell, state.mode);
    }

    // 观察新增 cell（滚动加载）+ 时间戳延迟出现的情况
    if (!activeObserver) {
      activeObserver = new MutationObserver((mutations) => {
        if (state.mode === 'off' || !activeContainer) return;
        for (const m of mutations) {
          for (const node of m.addedNodes) {
            if (node.nodeType !== 1) continue;
            if (node.matches && node.matches(SEL_CELL)) {
              applyCellOrder(node, state.mode);
            } else if (node.querySelectorAll) {
              for (const c of node.querySelectorAll(SEL_CELL)) {
                applyCellOrder(c, state.mode);
              }
            }
          }
        }
      });
    }
    activeObserver.observe(container, { childList: true, subtree: true });
    LOG('sort enabled on container with', container.querySelectorAll(SEL_CELL).length, 'cells');
  }

  function unsortTimeline() {
    if (activeObserver) activeObserver.disconnect();
    if (activeContainer) {
      activeContainer.classList.remove('xcs-sorted');
      for (const cell of activeContainer.querySelectorAll(SEL_CELL)) {
        cell.style.order = '';
      }
    }
    activeContainer = null;
    LOG('sort disabled');
  }

  function applySortMode() {
    if (state.mode === 'off') {
      unsortTimeline();
    } else {
      sortTimeline();
    }
  }

  // ====================================================================
  // UI: 右下角悬浮按钮 + 三选项菜单
  // ====================================================================
  const FAB_ICON_SVG = `
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M12 2a10 10 0 1 0 10 10A10 10 0 0 0 12 2zm0 18a8 8 0 1 1 8-8 8 8 0 0 1-8 8zm.5-13H11v6l5.2 3.1.8-1.3-4.5-2.7z"/>
    </svg>`;

  const OPTIONS = [
    { mode: 'newest', label: '从新到旧', icon: '↓' },
    { mode: 'oldest', label: '从旧到新', icon: '↑' },
    { mode: 'off',    label: '默认顺序', icon: '⊘' },
  ];

  let root = null;
  let fab = null;
  let menu = null;

  function buildUI() {
    if (document.getElementById('xcs-root')) return;

    root = document.createElement('div');
    root.id = 'xcs-root';

    fab = document.createElement('button');
    fab.id = 'xcs-fab';
    fab.type = 'button';
    fab.title = 'X Chrono Sort';
    fab.setAttribute('aria-label', 'X Chrono Sort');
    fab.setAttribute('aria-expanded', 'false');
    fab.innerHTML = FAB_ICON_SVG;
    fab.addEventListener('click', toggleMenu);

    menu = document.createElement('div');
    menu.id = 'xcs-menu';
    menu.hidden = true;
    menu.setAttribute('role', 'menu');

    for (const opt of OPTIONS) {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'xcs-opt';
      b.dataset.mode = opt.mode;
      b.setAttribute('role', 'menuitemradio');
      b.innerHTML = `<span class="xcs-opt-icon">${opt.icon}</span><span>${opt.label}</span>`;
      b.addEventListener('click', () => selectMode(opt.mode));
      menu.appendChild(b);
    }

    root.append(fab, menu);
    document.body.appendChild(root);

    document.addEventListener('click', (e) => {
      if (!menu.hidden && !root.contains(e.target)) {
        closeMenu();
      }
    }, true);

    refreshUI();
  }

  function toggleMenu() {
    if (menu.hidden) openMenu(); else closeMenu();
  }

  function openMenu() {
    menu.hidden = false;
    fab.setAttribute('aria-expanded', 'true');
  }

  function closeMenu() {
    menu.hidden = true;
    fab.setAttribute('aria-expanded', 'false');
  }

  function selectMode(mode) {
    state.mode = mode;
    LOG('mode →', mode);
    refreshUI();
    closeMenu();
    applySortMode();
  }

  function refreshUI() {
    if (!menu || !fab) return;
    for (const btn of menu.querySelectorAll('.xcs-opt')) {
      btn.classList.toggle('xcs-active', btn.dataset.mode === state.mode);
    }
    fab.classList.toggle('xcs-fab-active', state.mode !== 'off');
  }

  function applyPageVisibility() {
    if (!root) return;
    const show = state.pageType === 'profile' || state.pageType === 'status';
    root.style.display = show ? '' : 'none';
    if (!show) {
      closeMenu();
      unsortTimeline();
      return;
    }
    if (state.mode !== 'off') {
      // SPA 切换后 Twitter 需要时间渲染时间线，给个延迟再激活
      setTimeout(() => {
        if (state.mode !== 'off') applySortMode();
      }, 500);
    }
  }

  // ====================================================================
  // Boot
  // ====================================================================
  function boot() {
    LOG('content script loaded at', location.href);
    buildUI();
    state.pageType = detectPageType();
    applyPageVisibility();
    LOG('page type:', state.pageType);

    observeRouteChanges((from, to) => {
      const prev = state.pageType;
      state.pageType = detectPageType();
      LOG('route', from, '→', to, '| type', prev, '→', state.pageType);
      applyPageVisibility();
    });
  }

  if (document.body) {
    boot();
  } else {
    window.addEventListener('DOMContentLoaded', boot, { once: true });
  }
})();
