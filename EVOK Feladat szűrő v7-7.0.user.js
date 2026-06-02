// ==UserScript==
// @name         EVOK Feladat szűrő v7
// @namespace    http://tampermonkey.net/
// @version      7.7
// @description  Grading nézet + Értékelési napló: interaktív jelölt-szűrő UI az oldal alján, instant cache-ből, háttér-frissítés, oszlop-átrendezés, határidő-sor, részletes állapot, kétkategóriás összesítés, kattintás → értékelő
// @match        https://evok.cserkesz.hu/*
// @grant        GM_addStyle
// ==/UserScript==

(function () {
    'use strict';

    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    // ✏️  ALAPÉRTELMEZETT NEVEK (csak az ELSŐ futáskor használjuk,
    //     amíg a felhasználó az UI-n nem választ embereket).
    //     Utána az UI-ban való választást localStorage tárolja.
    const NEVEK = [
        "Harmos Luca",
        "Ambrus Orsolya",
        "Kerényi Kincső",
        "Fekete Rebeka Katica",
        "Lambert Dóra"
    ];
    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

    const MAX_SOROK             = 1;
    const CACHE_KEY_DEADLINES   = 'evok_deadlines_v3';
    const CACHE_KEY_STATUSES    = 'evok_statuses_v2';   // bumped: most már submittedAt is
    const KEY_SELECTED          = 'evok_selected_users_v1';
    const KEY_CANDIDATES        = 'evok_all_candidates_v2';   // bumped: tiszta nevek
    const HATTER_FRISSITES_KESLELTETES_MS = 800;

    // ── CSS ──────────────────────────────────────────────────────
    GM_addStyle(`
        /* === Csak az ASSIGN GRADING nézet === */
        #submissions th.header.c0, #submissions td.cell.c0                     { display: none !important; }
        #submissions th.header.c2.idnumber, #submissions td.cell.c2.idnumber   { display: none !important; }
        #submissions th.header.c3.email, #submissions td.cell.c3.email         { display: none !important; }
        #submissions th.header.c11, #submissions td.cell.c11                   { display: none !important; }
        #submissions th.header.c12, #submissions td.cell.c12                   { display: none !important; }
        #submissions .cell.c10 .no-overflow {
            display: -webkit-box !important;
            -webkit-line-clamp: ${MAX_SOROK} !important;
            -webkit-box-orient: vertical !important;
            overflow: hidden !important;
        }
        #submissions .cell.c10:hover .no-overflow {
            display: block !important; overflow: visible !important;
            -webkit-line-clamp: unset !important;
            position: relative; z-index: 10;
            background: #fff; box-shadow: 0 2px 12px rgba(0,0,0,.15);
            padding: 6px; border-radius: 6px;
        }
        #submissions tr td { vertical-align: middle !important; }
        #submissions td.cell.c1 { white-space: nowrap; }
        .evok-grade-btn {
            display: inline-block;
            background: #1a7f37; color: #fff !important;
            font-size: 12px; font-weight: 500;
            padding: 4px 10px; border-radius: 6px;
            text-decoration: none !important;
            white-space: nowrap; margin-right: 8px;
        }
        .evok-grade-btn:hover { background: #155d29; }

        /* === Értékelési napló === */
        #user-grades tr.userrow.evok-hidden { display: none !important; }
        #user-grades th.userfield.useridnumber, #user-grades td.userfield.useridnumber,
        #user-grades th.userfield.useremail,    #user-grades td.userfield.useremail {
            display: none !important;
        }
        #user-grades th.evok-future-col, #user-grades td.evok-future-col {
            display: none !important;
        }
        #user-grades tr.evok-deadline-row > * {
            background: #f6fbf7;
            font-size: 12px; font-weight: 600;
            color: #000 !important;
            text-align: center; padding: 4px 6px;
            border-top: 1px solid #1a7f37;
            border-bottom: 1px solid #1a7f37;
            white-space: nowrap;
            min-width: 60px;
        }
        #user-grades .evok-cellinfo,
        #user-grades .evok-cellinfo *,
        #user-grades .evok-counter,
        #user-grades .evok-counter * {
            color: #000 !important;
            font-weight: normal !important;
        }
        #user-grades .evok-cellinfo .grade-elfogadva,
        #user-grades .evok-counter-line.grade-elfogadva {
            color: #1a7f37 !important;
            font-weight: 700 !important;
        }
        #user-grades .evok-cellinfo {
            font-size: 11px; line-height: 1.35;
            display: flex; flex-direction: column; gap: 1px;
        }
        #user-grades .evok-cellinfo .grade { font-weight: 700 !important; margin-top: 2px; }
        #user-grades .evok-counter {
            font-size: 11px; line-height: 1.35;
            display: flex; flex-direction: column; gap: 1px;
        }
        #user-grades .evok-counter-line { white-space: normal; }
        #user-grades .evok-counter-total {
            font-weight: 700 !important;
            border-bottom: 1px dashed #999;
            margin-bottom: 2px; padding-bottom: 2px;
        }
        #user-grades .evok-counter-line.evok-late {
            font-weight: 600 !important;
            border-top: 1px dashed #999;
            margin-top: 2px; padding-top: 2px;
        }
        #user-grades td.gradecell.evok-clickable {
            cursor: pointer; position: relative;
            transition: background .1s ease-out;
        }
        #user-grades td.gradecell.evok-clickable:hover {
            background: #e8f5ec !important;
            outline: 2px solid #1a7f37; outline-offset: -2px;
        }

        /* === Szűrő panel (a v7 új funkciója) === */
        #evok-filter-panel {
            position: fixed;
            bottom: 0; right: 16px;
            width: 380px; max-width: calc(100vw - 32px);
            background: #fff;
            border: 2px solid #1a7f37;
            border-bottom: none;
            border-radius: 10px 10px 0 0;
            box-shadow: 0 -4px 16px rgba(0,0,0,.18);
            z-index: 99999;
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
            transition: max-height .25s ease;
            max-height: 540px;
            overflow: hidden;
            color: #000;
        }
        #evok-filter-panel.evok-collapsed {
            max-height: 46px;
        }
        .evok-filter-header {
            background: #1a7f37;
            color: #fff;
            padding: 12px 14px;
            cursor: pointer;
            display: flex;
            justify-content: space-between;
            align-items: center;
            font-size: 14px;
            user-select: none;
        }
        .evok-filter-header strong { font-weight: 700; }
        .evok-filter-toggle {
            background: transparent; border: none; color: #fff;
            font-size: 16px; cursor: pointer;
            padding: 2px 6px;
            transition: transform .2s;
        }
        #evok-filter-panel.evok-collapsed .evok-filter-toggle {
            transform: rotate(180deg);
        }
        .evok-filter-body { padding: 10px 12px; background: #fff; }
        #evok-filter-search {
            width: 100%; padding: 7px 10px;
            border: 1px solid #ccc; border-radius: 5px;
            box-sizing: border-box; font-size: 13px;
            margin-bottom: 8px;
            color: #000;
        }
        .evok-filter-actions {
            display: flex; gap: 6px; margin-bottom: 8px;
        }
        .evok-filter-actions button {
            flex: 1;
            background: #1a7f37; color: #fff;
            border: none; padding: 7px 10px;
            border-radius: 5px;
            cursor: pointer; font-size: 12px;
            font-weight: 500;
        }
        .evok-filter-actions button:hover { background: #155d29; }
        .evok-filter-actions button.secondary {
            background: #aaa;
        }
        .evok-filter-actions button.secondary:hover { background: #888; }
        .evok-filter-list {
            max-height: 320px; overflow-y: auto;
            border: 1px solid #eee; border-radius: 5px;
            padding: 4px;
        }
        .evok-filter-empty {
            padding: 12px; color: #888; font-size: 13px;
            text-align: center;
        }
        .evok-filter-item {
            display: flex; align-items: center; gap: 8px;
            padding: 5px 8px;
            font-size: 13px;
            color: #000 !important;
            cursor: pointer;
            border-radius: 4px;
        }
        .evok-filter-item:hover { background: #f0f7f2; }
        .evok-filter-item input[type="checkbox"] { margin: 0; }
        .evok-filter-item.selected { background: #e8f5ec; }
        .evok-filter-status {
            font-size: 11px; color: #777;
            margin-top: 6px; text-align: center;
        }

        #evok-szuro-jel {
            position: fixed; bottom: 16px; left: 16px;
            background: #1a7f37; color: #fff;
            padding: 8px 14px; border-radius: 8px;
            font-size: 12px; z-index: 99998;
            box-shadow: 0 2px 8px rgba(0,0,0,.2);
        }
    `);

    // ── Segédfüggvények ──────────────────────────────────────────
    function normaliz(s) {
        return (s || '').toLowerCase()
            .replace(/á/g,'a').replace(/é/g,'e').replace(/í/g,'i')
            .replace(/ó/g,'o').replace(/ö/g,'o').replace(/ő/g,'o')
            .replace(/ú/g,'u').replace(/ü/g,'u').replace(/ű/g,'u');
    }
    const normNames = NEVEK.map(normaliz);
    function egyezikNev(s) {
        const n = normaliz(s);
        return normNames.some(nev => n.includes(nev));
    }
    function getAssignId() {
        const m = window.location.href.match(/[?&]id=(\d+)/);
        return m ? m[1] : null;
    }
    function getUserIdFromTr(tr) {
        const m = (tr.className || '').match(/\buser(\d+)\b/);
        return m ? m[1] : null;
    }
    function jelzo(text) {
        let jel = document.getElementById('evok-szuro-jel');
        if (!jel) {
            jel = document.createElement('div');
            jel.id = 'evok-szuro-jel';
            document.body.appendChild(jel);
        }
        jel.textContent = text;
    }
    function isGraderReport() {
        return window.location.pathname.includes('/grade/report/grader/');
    }
    function isAssignGrading() {
        return window.location.href.includes('/mod/assign/view.php')
            && window.location.href.includes('action=grading');
    }
    function loadCache(key) {
        try {
            const raw = localStorage.getItem(key);
            if (!raw) return {};
            const obj = JSON.parse(raw);
            return (obj && typeof obj === 'object') ? obj : {};
        } catch (_) { return {}; }
    }
    function saveCache(key, obj) {
        try { localStorage.setItem(key, JSON.stringify(obj)); } catch (_) {}
    }

    // ── Kijelölés-tárolás (SELECTED USERS + ALL CANDIDATES) ────
    function loadSelected() {
        try {
            const raw = localStorage.getItem(KEY_SELECTED);
            if (!raw) return null;
            const arr = JSON.parse(raw);
            return Array.isArray(arr) ? arr.map(String) : null;
        } catch (_) { return null; }
    }
    function saveSelected(ids) {
        try { localStorage.setItem(KEY_SELECTED, JSON.stringify(ids)); } catch (_) {}
    }
    function loadCandidates() {
        try {
            const raw = localStorage.getItem(KEY_CANDIDATES);
            if (!raw) return [];
            const arr = JSON.parse(raw);
            return Array.isArray(arr) ? arr : [];
        } catch (_) { return []; }
    }
    function saveCandidates(list) {
        try { localStorage.setItem(KEY_CANDIDATES, JSON.stringify(list)); } catch (_) {}
    }

    // Globális kijelölés-állapot
    let selectedUserIds = loadSelected();   // null = még nincs UI-választás
    let lastCandidatesSnapshot = loadCandidates();

    function isUserSelected(uid, name) {
        if (selectedUserIds !== null) {
            return selectedUserIds.includes(String(uid));
        }
        // Vissza fallback a hardcoded NEVEK listára
        return egyezikNev(name);
    }

    // ── Jelölt-gyűjtés ──────────────────────────────────────────
    function mergeCandidates(newList) {
        if (!newList || newList.length === 0) return;
        const existing = loadCandidates();
        const map = {};
        existing.forEach(c => map[c.id] = c);
        newList.forEach(c => map[c.id] = c);   // friss verzió felülír
        const merged = Object.values(map).sort((a, b) =>
            a.name.localeCompare(b.name, 'hu'));
        saveCandidates(merged);
        lastCandidatesSnapshot = merged;
    }

    // A Moodle minden név elé tesz egy ".userinitials" span-t (pl. "AL"),
    // amit a textContent együtt szed ki a névvel. Ezt kiszedjük.
    function extractCleanName(a) {
        if (!a) return '';
        // 1) Próbáljuk az aria-label / title-t a userinitials span-ról — az tiszta név
        const init = a.querySelector('.userinitials');
        if (init) {
            const t = init.getAttribute('title') || init.getAttribute('aria-label');
            if (t && t.trim()) return t.trim();
        }
        // 2) Fallback: klónozzuk a linket, kiszedjük belőle a userinitials span-okat,
        //    majd vesszük a maradék szöveget
        const clone = a.cloneNode(true);
        clone.querySelectorAll('.userinitials').forEach(s => s.remove());
        return (clone.textContent || '').trim();
    }

    function collectCandidatesFromGraderReport() {
        const list = [];
        document.querySelectorAll('tr.userrow').forEach(tr => {
            const uid = tr.getAttribute('data-uid');
            const a   = tr.querySelector('a.username');
            if (uid && a) list.push({ id: String(uid), name: extractCleanName(a) });
        });
        mergeCandidates(list);
    }
    function collectCandidatesFromAssignView() {
        const list = [];
        document.querySelectorAll('tr[id^="mod_assign_grading-"]').forEach(tr => {
            const m = (tr.className || '').match(/\buser(\d+)\b/);
            const a = tr.querySelector('a.aabtn, a.d-inline-block');
            if (m && a) list.push({ id: String(m[1]), name: extractCleanName(a) });
        });
        mergeCandidates(list);
    }

    function initSelectedFromNevek() {
        if (selectedUserIds !== null) return;
        const candidates = loadCandidates();
        if (candidates.length === 0) return;
        const matched = candidates.filter(c => egyezikNev(c.name)).map(c => c.id);
        if (matched.length > 0) {
            selectedUserIds = matched;
            saveSelected(selectedUserIds);
        }
    }

    // ── Vízszintes scroll deszktop egérrel ──────────────────────
    // Csak ha valódi egér (pointer:fine), nem touch/trackpad-pinch;
    // és csak ha tényleg van horizontális overflow.
    function vízszintesScrollBekotes() {
        const table = document.querySelector('#user-grades');
        if (!table || table.dataset.evokScrollBound === '1') return;

        // Megkeressük a legközelebbi vízszintesen scrollolható ősét
        function getHScrollParent(el) {
            let parent = el.parentElement;
            while (parent) {
                const style = getComputedStyle(parent);
                if (/(auto|scroll)/.test(style.overflowX)) return parent;
                parent = parent.parentElement;
            }
            return document.scrollingElement || document.documentElement;
        }
        const container = getHScrollParent(table);
        if (!container) return;

        table.addEventListener('wheel', (e) => {
            // Mobil/touch eszközön ne nyúljunk hozzá
            if (window.matchMedia('(pointer: coarse)').matches) return;
            // Csak ha tényleg van horizontális tartalom
            if (container.scrollWidth <= container.clientWidth) return;
            if (e.deltaY === 0) return;
            // Ha a felhasználó Shift-et nyom, hagyjuk a böngésző natív
            // viselkedését (legtöbb böngészőben Shift+wheel = horizontal)
            if (e.shiftKey) return;
            e.preventDefault();
            container.scrollLeft += e.deltaY;
        }, { passive: false });

        table.dataset.evokScrollBound = '1';
    }

    // ── Bal oldali nav → grading URL ─────────────────────────────
    function navLinkekAtirasa() {
        document.querySelectorAll(
            'a.courseindex-link[href*="mod/assign/view.php"]'
        ).forEach(a => {
            if (!a.href.includes('action=grading')) {
                const url = new URL(a.href);
                url.searchParams.set('action', 'grading');
                a.href = url.toString();
            }
        });
    }

    // ═══════════════════════════════════════════════════════════
    // A) ASSIGN GRADING VIEW (régi v5)
    // ═══════════════════════════════════════════════════════════
    function gombokHozzaadasaAssignView() {
        if (!isAssignGrading()) return;
        const assignId = getAssignId();
        if (!assignId) return;
        document.querySelectorAll('tr[id^="mod_assign_grading-"]').forEach(tr => {
            if (tr.querySelector('.evok-grade-btn')) return;
            const userId = getUserIdFromTr(tr);
            if (!userId) return;
            const nameCell = tr.querySelector('td.cell.c1');
            if (!nameCell) return;
            const url = `https://evok.cserkesz.hu/mod/assign/view.php?id=${assignId}&rownum=0&action=grader&userid=${userId}`;
            const a = document.createElement('a');
            a.className = 'evok-grade-btn';
            a.href = url;
            a.textContent = '✎ Értékelés';
            a.title = 'Értékelő oldal megnyitása';
            nameCell.insertBefore(a, nameCell.firstChild);
        });
    }
    function szurAssignView() {
        if (!isAssignGrading()) return;
        document.querySelectorAll('tr[id^="mod_assign_grading-"]').forEach(tr => {
            const uid = getUserIdFromTr(tr);
            const nev = tr.querySelector('a.aabtn, a.d-inline-block');
            if (!uid || !nev) return;
            tr.style.display = isUserSelected(uid, nev.textContent || '') ? '' : 'none';
        });
        const sel = selectedUserIds ? selectedUserIds.length : NEVEK.length;
        jelzo(`Szűrő aktív (${sel} fő)`);
    }

    // ═══════════════════════════════════════════════════════════
    // B) GRADEBOOK (grader report)
    // ═══════════════════════════════════════════════════════════
    function buildItemMap() {
        const map = {};
        document.querySelectorAll('th[data-itemid] a.gradeitemheader').forEach(a => {
            const th = a.closest('th[data-itemid]');
            if (!th) return;
            const itemId = th.getAttribute('data-itemid');
            let m;
            if ((m = a.href.match(/mod\/assign\/view\.php\?id=(\d+)/))) {
                map[itemId] = { id: m[1], type: 'assign' };
            } else if ((m = a.href.match(/mod\/quiz\/view\.php\?id=(\d+)/))) {
                map[itemId] = { id: m[1], type: 'quiz' };
            }
        });
        return map;
    }
    function szurGradebook() {
        const sorok = document.querySelectorAll('tr.userrow');
        if (sorok.length === 0) return false;
        let lathato = 0;
        sorok.forEach(tr => {
            const uid = tr.getAttribute('data-uid');
            const nameLink = tr.querySelector('a.username');
            if (!uid || !nameLink) return;
            if (isUserSelected(uid, nameLink.textContent || '')) {
                tr.classList.remove('evok-hidden');
                lathato++;
            } else {
                tr.classList.add('evok-hidden');
            }
        });
        const sel = selectedUserIds ? selectedUserIds.length : NEVEK.length;
        jelzo(`Szűrő aktív (${sel} fő, ${lathato} látható)`);
        return true;
    }
    function cellaKattinthatova(itemMap) {
        const cells = document.querySelectorAll(
            'tr.userrow:not(.evok-hidden) td.gradecell[data-itemid]'
        );
        if (cells.length === 0) return false;
        cells.forEach(td => {
            if (td.classList.contains('evok-clickable')) return;
            const itemId = td.getAttribute('data-itemid');
            const entry  = itemMap[itemId];
            if (!entry || entry.type !== 'assign') return;
            const tr     = td.closest('tr.userrow');
            const userId = tr && tr.getAttribute('data-uid');
            if (!userId) return;
            const url = `https://evok.cserkesz.hu/mod/assign/view.php?id=${entry.id}&rownum=0&action=grader&userid=${userId}`;
            td.dataset.evokUrl = url;
            td.classList.add('evok-clickable');
            td.title = 'Kattints: értékelő új tabban';
            // Minden klikk → új tab
            td.addEventListener('click', (e) => {
                if (e.target.closest('.action-menu, button, a')) return;
                e.preventDefault();
                window.open(url, '_blank');
            });
            // Középső egérgomb is új tab (a böngészők default scroll-toggle-t csinálnak helyette)
            td.addEventListener('auxclick', (e) => {
                if (e.button !== 1) return;
                if (e.target.closest('.action-menu, button, a')) return;
                e.preventDefault();
                window.open(url, '_blank');
            });
            td.addEventListener('mousedown', (e) => {
                if (e.button === 1 && !e.target.closest('.action-menu, button, a')) {
                    e.preventDefault();
                }
            });
        });
        return true;
    }

    // ── Határidő: cache + fresh ────────────────────────────────
    function cachedDeadline(entry) {
        const cache = loadCache(CACHE_KEY_DEADLINES);
        const ent = cache[`${entry.type}_${entry.id}`];
        return ent ? ent.d : undefined;
    }
    async function fetchDeadline(entry) {
        const c = cachedDeadline(entry);
        if (c !== undefined) return c;
        return await freshFetchDeadline(entry);
    }
    async function freshFetchDeadline(entry) {
        const cacheKey = `${entry.type}_${entry.id}`;
        const cache = loadCache(CACHE_KEY_DEADLINES);
        const url = entry.type === 'quiz'
            ? `https://evok.cserkesz.hu/mod/quiz/view.php?id=${entry.id}`
            : `https://evok.cserkesz.hu/mod/assign/view.php?id=${entry.id}`;
        try {
            const resp = await fetch(url, { credentials: 'include' });
            const html = await resp.text();
            const doc  = new DOMParser().parseFromString(html, 'text/html');
            let deadline = null;
            const datesBlock = doc.querySelector('[data-region="activity-dates"]');
            if (datesBlock) {
                datesBlock.querySelectorAll('div').forEach(div => {
                    if (deadline) return;
                    const txt = (div.textContent || '').trim();
                    const m = txt.match(/(?:Esedékes|Határidő|Beadás|Bezár)[^:]*:\s*(.+)/i);
                    if (m) deadline = m[1].trim();
                });
            }
            if (!deadline) {
                doc.querySelectorAll('strong').forEach(s => {
                    if (deadline) return;
                    const label = (s.textContent || '').trim();
                    if (/^(Esedékes|Határidő|Beadás|Bezár)/i.test(label)) {
                        const node = s.nextSibling;
                        if (node && node.textContent) {
                            const t = node.textContent.replace(/^[:\s]+/, '').trim();
                            if (t) deadline = t;
                        }
                    }
                });
            }
            if (!deadline) {
                const intro = doc.querySelector('#intro, .activity-description');
                if (intro) {
                    const m = (intro.textContent || '').match(/(?:Beadási\s*határidő|Határidő|Esedékesség|Bezár)[^:]*:\s*([^\n<]+?)(?:\s{2}|\n|$)/i);
                    if (m) deadline = m[1].trim();
                }
            }
            cache[cacheKey] = { t: Date.now(), d: deadline };
            saveCache(CACHE_KEY_DEADLINES, cache);
            return deadline;
        } catch (_) { return null; }
    }

    // ── Státuszok ───────────────────────────────────────────────
    function cachedStatuses(assignId) {
        const cache = loadCache(CACHE_KEY_STATUSES);
        const ent = cache[assignId];
        return ent ? ent.s : undefined;
    }
    async function fetchStatuses(assignId) {
        const c = cachedStatuses(assignId);
        if (c !== undefined) return c;
        return await freshFetchStatuses(assignId);
    }
    async function freshFetchStatuses(assignId) {
        const cache = loadCache(CACHE_KEY_STATUSES);
        try {
            const resp = await fetch(
                `https://evok.cserkesz.hu/mod/assign/view.php?id=${assignId}&action=grading`,
                { credentials: 'include' }
            );
            const html = await resp.text();
            const doc  = new DOMParser().parseFromString(html, 'text/html');
            const statuses = {};
            doc.querySelectorAll('tr[id^="mod_assign_grading-"]').forEach(tr => {
                const m = (tr.className || '').match(/\buser(\d+)\b/);
                if (!m) return;
                const userId = m[1];
                const lines = [];
                const statusTd = tr.querySelector('td.cell.c4.status .submissioninfo');
                if (statusTd) {
                    statusTd.querySelectorAll(':scope > div').forEach(d => {
                        const text = (d.textContent || '').trim();
                        if (!text) return;
                        let cls = 'line';
                        const cn = (d.className || '').toLowerCase();
                        if      (cn.includes('submitted'))    cls += ' submitted';
                        else if (cn.includes('notsubmitted')) cls += ' notsubmitted';
                        else if (cn.includes('graded'))       cls += ' graded';
                        else if (cn.includes('overdue'))      cls += ' overdue';
                        else if (cn.includes('late'))         cls += ' late';
                        else if (cn.includes('reminder'))     cls += ' reminder';
                        lines.push({ text, cls });
                    });
                }
                let grade = null;
                const gradeTd = tr.querySelector('td.cell.c5.grade');
                if (gradeTd) {
                    const w100 = gradeTd.querySelector('.w-100');
                    grade = ((w100 ? w100.textContent : gradeTd.textContent) || '').trim();
                }
                // Leadási időpont (utolsó módosítás)
                let submittedAt = null;
                const tsTd = tr.querySelector('td.cell.c6');
                if (tsTd) {
                    const txt = (tsTd.textContent || '').trim();
                    if (txt && txt !== '-' && txt !== '') {
                        const dt = parseDateTimeHU(txt);
                        if (dt) submittedAt = dt.getTime();
                    }
                }
                statuses[userId] = { lines, grade, submittedAt };
            });
            cache[assignId] = { t: Date.now(), s: statuses };
            saveCache(CACHE_KEY_STATUSES, cache);
            return statuses;
        } catch (_) { return {}; }
    }

    // ── Dátum ──────────────────────────────────────────────────
    const HUN_HONAPOK = {
        'január':0,'februar':1,'február':1,'március':2,'marcius':2,'április':3,'aprilis':3,
        'május':4,'majus':4,'június':5,'junius':5,'július':6,'julius':6,
        'augusztus':7,'szeptember':8,'október':9,'oktober':9,'november':10,'december':11
    };
    const HUN_NAPOK = ['V', 'H', 'K', 'Sze', 'Cs', 'P', 'Szo'];
    function parseDeadline(s) {
        if (!s) return null;
        let m = s.match(/(\d{4})\.?\s*([A-Za-zÁÉÍÓÖŐÚÜŰáéíóöőúüű]+)\.?\s*(\d{1,2})/);
        if (m) {
            const honap = HUN_HONAPOK[m[2].toLowerCase()];
            if (honap !== undefined) return new Date(+m[1], honap, +m[3]);
        }
        m = s.match(/(\d{4})[.\-](\d{1,2})[.\-](\d{1,2})/);
        if (m) return new Date(+m[1], +m[2]-1, +m[3]);
        return null;
    }
    // Teljes datetime (óra:perc) parsoláshoz — Moodle magyar formátum
    // pl. "2026. március 15., vasárnap, 23:59"  →  Date(2026, 2, 15, 23, 59)
    function parseDateTimeHU(s) {
        if (!s) return null;
        const m = s.match(/(\d{4})\.?\s*([A-Za-zÁÉÍÓÖŐÚÜŰáéíóöőúüű]+)\.?\s*(\d{1,2})\.?,?\s*(?:[A-Za-zÁÉÍÓÖŐÚÜŰáéíóöőúüű]+,?\s*)?(\d{1,2}):(\d{2})/);
        if (m) {
            const honap = HUN_HONAPOK[m[2].toLowerCase()];
            if (honap !== undefined) {
                return new Date(+m[1], honap, +m[3], +m[4], +m[5]);
            }
        }
        return null;
    }
    // Határidő teljes datetime-ként — ha nincs óra, akkor a nap végét (23:59) használjuk
    function parseDeadlineDT(s) {
        if (!s) return null;
        const dt = parseDateTimeHU(s);
        if (dt) return dt;
        const d = parseDeadline(s);
        if (d) { d.setHours(23, 59, 0, 0); return d; }
        return null;
    }
    function formatMMDD(dt) {
        if (!dt) return '';
        const mm = String(dt.getMonth()+1).padStart(2,'0');
        const dd = String(dt.getDate()).padStart(2,'0');
        return `${mm}.${dd}. ${HUN_NAPOK[dt.getDay()]}`;
    }

    // ── Oszlop rendezés + határidő-sor ─────────────────────────
    async function oszlopRendezesEsHataridok(itemMap, mode) {
        avgSorColspanJavitas();
        if (mode === 'fresh') {
            document.querySelectorAll('#user-grades .evok-future-col')
                .forEach(el => el.classList.remove('evok-future-col'));
        }
        const cols = [];
        for (const itemId in itemMap) {
            const entry = itemMap[itemId];
            const th = document.querySelector(`th[data-itemid="${itemId}"]`);
            if (!th) continue;
            let raw;
            if (mode === 'fresh') {
                raw = await freshFetchDeadline(entry);
                await new Promise(r => setTimeout(r, 40));
            } else {
                raw = cachedDeadline(entry);
                if (raw === undefined) raw = null;
            }
            const dt = parseDeadline(raw);
            cols.push({ itemId, entry, th, deadlineDt: dt, deadlineRaw: raw });
        }
        const ma = new Date();
        cols.forEach(c => {
            const future = c.deadlineDt && c.deadlineDt > ma;
            if (future) {
                c.th.classList.add('evok-future-col');
                document.querySelectorAll(`td[data-itemid="${c.itemId}"]`)
                    .forEach(td => td.classList.add('evok-future-col'));
            }
        });
        const visibleCols = cols
            .filter(c => !(c.deadlineDt && c.deadlineDt > ma))
            .sort((a, b) => {
                const da = a.deadlineDt ? a.deadlineDt.getTime() : 0;
                const db = b.deadlineDt ? b.deadlineDt.getTime() : 0;
                return db - da;
            });
        const futureCols = cols.filter(c => c.deadlineDt && c.deadlineDt > ma);
        const headingRow = document.querySelector('#user-grades tr.heading');
        if (headingRow) {
            visibleCols.concat(futureCols).forEach(c => headingRow.appendChild(c.th));
        }
        document.querySelectorAll('#user-grades tr.userrow, #user-grades tr.avg').forEach(tr => {
            visibleCols.concat(futureCols).forEach(c => {
                const td = tr.querySelector(`td[data-itemid="${c.itemId}"]`);
                if (td) tr.appendChild(td);
            });
        });
        hataridoSorEpitese(cols);
    }
    function hataridoSorEpitese(cols) {
        const heading = document.querySelector('#user-grades tr.heading');
        if (!heading) return;
        const tbody = heading.parentNode;
        const regi = tbody.querySelector('tr.evok-deadline-row');
        if (regi) regi.remove();
        const newRow = document.createElement('tr');
        newRow.className = 'evok-deadline-row';
        Array.from(heading.children).forEach(th => {
            const cell = document.createElement('th');
            cell.className = th.className;
            cell.classList.remove('category');
            cell.innerHTML = '&nbsp;';
            const itemId = th.getAttribute('data-itemid');
            if (itemId) {
                cell.setAttribute('data-itemid', itemId);
                const c = cols.find(x => x.itemId === itemId);
                if (c && c.deadlineDt) {
                    cell.textContent = formatMMDD(c.deadlineDt);
                    cell.title = 'Határidő: ' + (c.deadlineRaw || '');
                }
            }
            newRow.appendChild(cell);
        });
        tbody.insertBefore(newRow, heading.nextSibling);
    }

    // ── Állapotok cellákban ─────────────────────────────────────
    function summarizeStatus(data) {
        const grade   = (data.grade || '').trim();
        const hasGrade = grade && grade !== '-';
        const hasLines = data.lines && data.lines.length > 0;
        if (!hasGrade && !hasLines) return null;
        if (grade.toLowerCase() === 'elfogadva') return 'Elfogadva';
        return 'Egyéb';
    }
    function detailedStatus(data) {
        const grade = (data.grade || '').trim();
        if (grade && grade !== '-') return grade;
        if (data.lines && data.lines.length) return data.lines[0].text;
        return null;
    }
    // Késés-számítás:
    // - Csak akkor jelöljük késésnek, ha VAN leadási időpont (data.submittedAt)
    //   ÉS VAN feladat-határidő (deadlineDt) és a leadás KÉSŐBB történt.
    // - HA "újra leadott munka" indikátor szerepel, NEM számoljuk be
    //   (mert az eredeti leadás valószínűleg időben volt).
    // - Ha nincs leadási időpont vagy határidő datetime → null
    //   (nem számoljuk, ne legyen téves jelölés).
    function isLateSubmission(data, deadlineDt) {
        if (!data) return false;
        if (!data.submittedAt || !deadlineDt) return false;
        if (data.submittedAt <= deadlineDt.getTime()) return false;
        // Késő — de ha újra leadta, kihagyjuk
        const hasResubmit = data.lines && data.lines.some(l =>
            (l.cls && l.cls.includes('reminder')) ||
            /újra\s*leadott/i.test(l.text || '')
        );
        return !hasResubmit;
    }
    async function cellaAllapotok(itemMap, mode) {
        const userIds = [];
        document.querySelectorAll('tr.userrow:not(.evok-hidden)').forEach(tr => {
            const uid = tr.getAttribute('data-uid');
            if (uid) userIds.push(uid);
        });
        if (userIds.length === 0) return;
        // ÚJ: legújabb határidős feladatok először (intuitív UX),
        // így a bal oldali oszlopok hamarabb töltődnek be.
        const sortedItemIds = Object.keys(itemMap).sort((a, b) => {
            const da = parseDeadlineDT(cachedDeadline(itemMap[a]));
            const db = parseDeadlineDT(cachedDeadline(itemMap[b]));
            const ta = da ? da.getTime() : 0;
            const tb = db ? db.getTime() : 0;
            return tb - ta;
        });
        for (const itemId of sortedItemIds) {
            const entry = itemMap[itemId];
            if (entry.type !== 'assign') continue;
            const deadlineDt = parseDeadlineDT(cachedDeadline(entry));
            let statuses;
            if (mode === 'fresh') {
                statuses = await freshFetchStatuses(entry.id);
            } else {
                statuses = cachedStatuses(entry.id);
                if (statuses === undefined) statuses = null;
            }
            if (!statuses) continue;
            userIds.forEach(uid => {
                const td = document.querySelector(
                    `tr.userrow[data-uid="${uid}"] td[data-itemid="${itemId}"]`
                );
                if (!td) return;
                const regi = td.querySelector('.evok-cellinfo');
                if (regi) {
                    if (mode !== 'fresh') return;
                    regi.remove();
                }
                const data = statuses[uid] || { lines: [], grade: null };
                const origGrade = td.querySelector('.gradevalue');
                const gradeText = (data.grade && data.grade !== '-' && data.grade)
                                 || (origGrade && origGrade.textContent.trim())
                                 || null;
                const header = td.querySelector('.header');
                const info = document.createElement('div');
                info.className = 'evok-cellinfo';
                data.lines.forEach(l => {
                    const div = document.createElement('div');
                    div.className = l.cls;
                    div.textContent = l.text;
                    info.appendChild(div);
                });
                if (gradeText) {
                    const g = document.createElement('div');
                    g.className = 'grade';
                    if (gradeText.toLowerCase() === 'elfogadva') g.classList.add('grade-elfogadva');
                    g.textContent = gradeText;
                    info.appendChild(g);
                }
                if (header) {
                    header.innerHTML = '';
                    header.appendChild(info);
                } else {
                    const target = td.querySelector('.d-flex .d-flex.flex-grow-1') || td;
                    target.appendChild(info);
                }
                const summary = summarizeStatus(data);
                if (summary) td.dataset.evokSummary = summary;
                else delete td.dataset.evokSummary;
                const detail = detailedStatus(data);
                if (detail) td.dataset.evokDetail = detail;
                else delete td.dataset.evokDetail;
                if (isLateSubmission(data, deadlineDt)) td.dataset.evokLate = '1';
                else delete td.dataset.evokLate;
            });
            if (mode === 'fresh') await new Promise(r => setTimeout(r, 50));
        }
    }
    function statuszSzamlalo() {
        document.querySelectorAll('tr.userrow:not(.evok-hidden)').forEach(tr => {
            const counts = {};
            let total = 0;
            tr.querySelectorAll('td.gradecell[data-itemid]:not(.evok-future-col)').forEach(td => {
                if (td.classList.contains('course')) return;
                const detail = td.dataset.evokDetail;
                if (!detail) return;
                counts[detail] = (counts[detail] || 0) + 1;
                total++;
            });
            const courseTd = tr.querySelector('td.gradecell.course[data-itemid]');
            if (!courseTd) return;
            const regi = courseTd.querySelector('.evok-counter');
            if (regi) regi.remove();
            const wrap = document.createElement('div');
            wrap.className = 'evok-counter';
            const totalDiv = document.createElement('div');
            totalDiv.className = 'evok-counter-total';
            totalDiv.textContent = `Összesen: ${total}`;
            wrap.appendChild(totalDiv);
            Object.entries(counts)
                .sort((a, b) => b[1] - a[1])
                .forEach(([k, v]) => {
                    const d = document.createElement('div');
                    d.className = 'evok-counter-line';
                    if (k.toLowerCase() === 'elfogadva') d.classList.add('grade-elfogadva');
                    d.textContent = `${k}: ${v}`;
                    wrap.appendChild(d);
                });
            const target = courseTd.querySelector('.header') || courseTd;
            target.innerHTML = '';
            target.appendChild(wrap);
        });
    }
    function avgSorColspanJavitas() {
        const avgRow = document.querySelector('#user-grades tr.avg');
        if (!avgRow) return;
        const labelCell = avgRow.querySelector('th.header.range');
        if (!labelCell || labelCell.dataset.evokFixed === '1') return;
        const orig = labelCell.colSpan;
        if (orig > 1) {
            labelCell.colSpan = 1;
            const filler2 = document.createElement('th');
            filler2.className = 'userfield useremail cell c2 collapsed evok-filler';
            labelCell.parentNode.insertBefore(filler2, labelCell.nextSibling);
            const filler1 = document.createElement('th');
            filler1.className = 'userfield useridnumber cell c1 evok-filler';
            labelCell.parentNode.insertBefore(filler1, labelCell.nextSibling);
        }
        labelCell.dataset.evokFixed = '1';
    }
    function globalisAtlagAtirasa(itemMap) {
        const avgRow = document.querySelector('#user-grades tr.avg');
        if (!avgRow) return;
        avgSorColspanJavitas();
        const labelCell = avgRow.querySelector('th.header.range');
        if (labelCell) labelCell.textContent = 'Aktív szűrő összesítése';
        avgRow.querySelectorAll('td[data-itemid]').forEach(td => {
            const itemId = td.getAttribute('data-itemid');
            const entry = itemMap[itemId];
            const isCourseItem = !entry;
            const regi = td.querySelector('.evok-counter');
            if (regi) regi.remove();
            if (isCourseItem) {
                const target = td.querySelector('[data-collapse="avgrowcell"]') || td;
                target.innerHTML = '&nbsp;';
                return;
            }
            const counts = {};
            let total = 0;
            document.querySelectorAll(
                `tr.userrow:not(.evok-hidden) td[data-itemid="${itemId}"]`
            ).forEach(cell => {
                const s = cell.dataset.evokSummary;
                if (!s) return;
                counts[s] = (counts[s] || 0) + 1;
                total++;
            });
            if (total === 0) return;
            const wrap = document.createElement('div');
            wrap.className = 'evok-counter';
            const totalDiv = document.createElement('div');
            totalDiv.className = 'evok-counter-total';
            totalDiv.textContent = `Összesen: ${total}`;
            wrap.appendChild(totalDiv);
            Object.entries(counts)
                .sort((a, b) => b[1] - a[1])
                .forEach(([k, v]) => {
                    const d = document.createElement('div');
                    d.className = 'evok-counter-line';
                    if (k.toLowerCase() === 'elfogadva') d.classList.add('grade-elfogadva');
                    d.textContent = `${k}: ${v}`;
                    wrap.appendChild(d);
                });
            const target = td.querySelector('[data-collapse="avgrowcell"]') || td;
            target.innerHTML = '';
            target.appendChild(wrap);
        });
    }

    // ═══════════════════════════════════════════════════════════
    // C) SZŰRŐ PANEL UI (v7 új)
    // ═══════════════════════════════════════════════════════════
    function buildFilterUI() {
        if (document.getElementById('evok-filter-panel')) {
            refreshFilterUI();
            return;
        }
        const panel = document.createElement('div');
        panel.id = 'evok-filter-panel';
        panel.classList.add('evok-collapsed');
        panel.innerHTML = `
            <div class="evok-filter-header">
                <span>Jelölt-szűrő: <strong id="evok-filter-count">0 kiválasztva</strong></span>
                <button class="evok-filter-toggle" type="button">▲</button>
            </div>
            <div class="evok-filter-body">
                <input type="text" id="evok-filter-search" placeholder="🔍 Keresés a névben…">
                <div class="evok-filter-actions">
                    <button id="evok-filter-select-all" type="button">Összes</button>
                    <button id="evok-filter-clear" type="button" class="secondary">Töröl mind</button>
                </div>
                <div class="evok-filter-list"></div>
                <div class="evok-filter-status"></div>
            </div>
        `;
        document.body.appendChild(panel);

        const header   = panel.querySelector('.evok-filter-header');
        const listEl   = panel.querySelector('.evok-filter-list');
        const searchEl = panel.querySelector('#evok-filter-search');

        // Header kattintással / gombbal nyit-zár
        header.addEventListener('click', (e) => {
            if (e.target.closest('button, input')) return;
            panel.classList.toggle('evok-collapsed');
        });
        panel.querySelector('.evok-filter-toggle').addEventListener('click', (e) => {
            e.stopPropagation();
            panel.classList.toggle('evok-collapsed');
        });
        searchEl.addEventListener('input', () => {
            renderCandidateList(listEl, loadCandidates(), searchEl.value);
        });
        panel.querySelector('#evok-filter-select-all').addEventListener('click', () => {
            const all = loadCandidates();
            selectedUserIds = all.map(c => c.id);
            saveSelected(selectedUserIds);
            refreshFilterUI();
            applyFilterChange();
        });
        panel.querySelector('#evok-filter-clear').addEventListener('click', () => {
            selectedUserIds = [];
            saveSelected(selectedUserIds);
            refreshFilterUI();
            applyFilterChange();
        });

        renderCandidateList(listEl, loadCandidates(), '');
        updateFilterCountLabel();
    }

    function renderCandidateList(container, candidates, searchTerm) {
        container.innerHTML = '';
        if (candidates.length === 0) {
            const empty = document.createElement('div');
            empty.className = 'evok-filter-empty';
            empty.textContent = 'Nincs még jelölt-lista. Nyisd meg az értékelőjelentést a teljes listához.';
            container.appendChild(empty);
            return;
        }
        const term = normaliz(searchTerm || '');
        const filtered = candidates.filter(c => normaliz(c.name).includes(term));
        if (filtered.length === 0) {
            const empty = document.createElement('div');
            empty.className = 'evok-filter-empty';
            empty.textContent = 'Nincs találat.';
            container.appendChild(empty);
            return;
        }
        const sel = selectedUserIds || [];
        filtered.forEach(c => {
            const label = document.createElement('label');
            label.className = 'evok-filter-item';
            const isSel = sel.includes(c.id);
            if (isSel) label.classList.add('selected');
            const cb = document.createElement('input');
            cb.type = 'checkbox';
            cb.value = c.id;
            cb.checked = isSel;
            cb.addEventListener('change', () => {
                if (selectedUserIds === null) selectedUserIds = [];
                if (cb.checked) {
                    if (!selectedUserIds.includes(c.id)) selectedUserIds.push(c.id);
                    label.classList.add('selected');
                } else {
                    selectedUserIds = selectedUserIds.filter(id => id !== c.id);
                    label.classList.remove('selected');
                }
                saveSelected(selectedUserIds);
                updateFilterCountLabel();
                applyFilterChange();
            });
            const txt = document.createElement('span');
            txt.textContent = c.name;
            label.appendChild(cb);
            label.appendChild(txt);
            container.appendChild(label);
        });
    }
    function refreshFilterUI() {
        const panel = document.getElementById('evok-filter-panel');
        if (!panel) return;
        const listEl = panel.querySelector('.evok-filter-list');
        const searchEl = panel.querySelector('#evok-filter-search');
        renderCandidateList(listEl, loadCandidates(), searchEl ? searchEl.value : '');
        updateFilterCountLabel();
    }
    function updateFilterCountLabel() {
        const el = document.getElementById('evok-filter-count');
        if (!el) return;
        const count = (selectedUserIds || []).length;
        const total = loadCandidates().length;
        el.textContent = total > 0
            ? `${count} / ${total} kiválasztva`
            : `${count} kiválasztva`;
    }
    async function applyFilterChange() {
        if (isGraderReport()) {
            szurGradebook();
            if (itemMapCache) {
                await cellaAllapotok(itemMapCache, 'cache');
                statuszSzamlalo();
                globalisAtlagAtirasa(itemMapCache);
            }
        } else if (isAssignGrading()) {
            szurAssignView();
        }
    }

    // ═══════════════════════════════════════════════════════════
    // D) Indítás
    // ═══════════════════════════════════════════════════════════
    let itemMapCache = null;
    let szurKesz = false;
    let cellaKesz = false;
    let aszinkronFutott = false;
    let observer = null;

    function vanCacheAdat(itemMap) {
        for (const itemId in itemMap) {
            if (cachedDeadline(itemMap[itemId]) !== undefined) return true;
            const e = itemMap[itemId];
            if (e.type === 'assign' && cachedStatuses(e.id) !== undefined) return true;
        }
        return false;
    }
    async function ketFazisuRender(itemMap) {
        const cacheVan = vanCacheAdat(itemMap);
        if (cacheVan) {
            jelzo(`Cache betöltése…`);
            await oszlopRendezesEsHataridok(itemMap, 'cache');
            await cellaAllapotok(itemMap, 'cache');
            statuszSzamlalo();
            globalisAtlagAtirasa(itemMap);
            jelzo(`Cache megjelenítve · háttér-frissítés…`);
        } else {
            jelzo(`Első betöltés, ez kis ideig tart…`);
        }
        await oszlopRendezesEsHataridok(itemMap, 'fresh');
        await cellaAllapotok(itemMap, 'fresh');
        statuszSzamlalo();
        globalisAtlagAtirasa(itemMap);
        const sel = selectedUserIds ? selectedUserIds.length : NEVEK.length;
        jelzo(`Friss adatokkal frissítve (${sel} fő)`);
    }

    function mindenFut() {
        navLinkekAtirasa();
        if (isGraderReport()) {
            if (!itemMapCache || Object.keys(itemMapCache).length === 0) {
                itemMapCache = buildItemMap();
            }
            collectCandidatesFromGraderReport();
            initSelectedFromNevek();
            if (!szurKesz)  szurKesz  = szurGradebook();
            if (!cellaKesz) cellaKesz = cellaKattinthatova(itemMapCache);
            vízszintesScrollBekotes();
            buildFilterUI();
            if (szurKesz && cellaKesz) {
                if (observer) { observer.disconnect(); observer = null; }
                if (!aszinkronFutott && Object.keys(itemMapCache).length > 0) {
                    aszinkronFutott = true;
                    setTimeout(() => ketFazisuRender(itemMapCache),
                               HATTER_FRISSITES_KESLELTETES_MS);
                }
            }
        } else if (isAssignGrading()) {
            collectCandidatesFromAssignView();
            initSelectedFromNevek();
            szurAssignView();
            gombokHozzaadasaAssignView();
            buildFilterUI();
        } else {
            // Más oldalak (pl. dashboard) — csak a szűrő panelt mutatjuk,
            // ha van candidate-lista cache-elve.
            if (loadCandidates().length > 0) buildFilterUI();
        }
    }

    let debTimer = null;
    function mindenFutDebounce() {
        if (debTimer) clearTimeout(debTimer);
        debTimer = setTimeout(mindenFut, 250);
    }
    function inditas() {
        mindenFut();
        observer = new MutationObserver(mindenFutDebounce);
        observer.observe(document.body, { childList: true, subtree: true });
        setTimeout(() => {
            if (observer) { observer.disconnect(); observer = null; }
        }, 8000);
    }
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', inditas);
    } else {
        inditas();
    }
})();
