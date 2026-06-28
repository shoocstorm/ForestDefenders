import {
  UPGRADES, UPGRADE_ORDER, UPGRADE_MAX_TIER, CONSUMABLES, SHOP_WEAPONS,
} from '../config/Constants.js';

// "Old Owl's Outfitters" — the shop (ECONOMY_SHOP_SPEC §2). A glass overlay opened
// from the victory screen or the P hotkey; freezes the game while up. Category tabs
// filter the card grid. Cards show icon / name / price / a stat preview and gray out
// when unaffordable, maxed or owned. Purchases deduct gold via the GameManager and
// trigger `onPurchase` (which the Game uses to persist the save).
const TABS = ['All', 'Weapons', 'Hero', 'Supplies'];

export class Shop {
  constructor({ gameManager, player, onClose, onPurchase, toasts }) {
    this.gm = gameManager;
    this.player = player;
    this.onClose = onClose;
    this.onPurchase = onPurchase;
    this.toasts = toasts;
    this.tab = 'All';
    this.isOpen = false;

    const root = document.createElement('div');
    root.id = 'fd-shop';
    root.innerHTML = `
      <style>
        #fd-shop{position:fixed;inset:0;z-index:45;display:none;align-items:center;justify-content:center;
          font-family:"Rajdhani","Trebuchet MS",system-ui,sans-serif;color:#eaf7df;}
        #fd-shop.open{display:flex;}
        #shop-bg{position:absolute;inset:0;background:radial-gradient(circle at 50% 35%,#0b1612e8,#000000f4);
          backdrop-filter:blur(7px);-webkit-backdrop-filter:blur(7px);}
        #shop-panel{position:relative;width:min(860px,94vw);max-height:88vh;display:flex;flex-direction:column;
          background:linear-gradient(160deg,#16281df7,#0b140ef9);border:1px solid #ffffff22;border-radius:20px;
          box-shadow:0 24px 70px #000b, inset 0 0 50px #00000040;overflow:hidden;}
        #shop-head{display:flex;align-items:center;justify-content:space-between;padding:18px 26px 12px;
          border-bottom:1px solid #ffffff18;}
        #shop-title{font-size:26px;font-weight:800;letter-spacing:1px;color:#ffe08a;
          text-shadow:0 2px 0 #0008,0 0 18px #ffb31a55;}
        #shop-title small{display:block;font-size:12px;letter-spacing:3px;color:#9fdca0;font-weight:700;opacity:.8;}
        #shop-gold{display:flex;align-items:center;gap:9px;font-size:26px;font-weight:800;color:#ffd24a;
          text-shadow:0 2px 0 #0008,0 0 16px #ffb31a55;}
        #shop-gold .coin{width:24px;height:24px;border-radius:50%;
          background:radial-gradient(circle at 35% 30%,#ffe89a,#e8a81f 70%,#a8740c);
          box-shadow:0 0 10px #ffbf3a88, inset 0 -2px 3px #0006;display:flex;align-items:center;
          justify-content:center;font-size:13px;color:#7a4d05;}
        #shop-gold.pulse{animation:shoppulse .35s ease;}
        @keyframes shoppulse{0%{transform:scale(1)}40%{transform:scale(1.22)}100%{transform:scale(1)}}
        #shop-tabs{display:flex;gap:8px;padding:12px 26px 0;}
        .shop-tab{pointer-events:auto;cursor:pointer;font-size:13px;font-weight:800;letter-spacing:1.5px;
          padding:7px 16px;border-radius:10px 10px 0 0;background:#0a160e88;border:1px solid #ffffff14;
          border-bottom:none;color:#9bbf8a;text-transform:uppercase;transition:all .15s;}
        .shop-tab.active{background:#13261a;color:#fff;box-shadow:0 -2px 14px -4px #a8e06388;}
        #shop-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(180px,1fr));gap:12px;
          padding:18px 26px;overflow-y:auto;}
        .shop-card{position:relative;pointer-events:auto;cursor:pointer;text-align:left;
          background:linear-gradient(160deg,#11201688,#0a130d99);border:1px solid #ffffff1e;border-radius:14px;
          padding:13px 14px;transition:transform .12s,box-shadow .12s,border-color .15s;}
        .shop-card:hover{transform:translateY(-3px);border-color:#a8e06366;box-shadow:0 10px 26px -8px #000a,0 0 18px -6px #a8e06366;}
        .shop-card.disabled{opacity:.45;cursor:not-allowed;filter:grayscale(.4);}
        .shop-card.disabled:hover{transform:none;box-shadow:none;border-color:#ffffff1e;}
        .shop-card .ic{font-size:28px;}
        .shop-card .nm{font-size:15px;font-weight:800;color:#fff;margin-top:4px;}
        .shop-card .ds{font-size:12px;opacity:.8;min-height:30px;margin-top:2px;}
        .shop-card .prev{font-size:11px;color:#9fe8ff;font-weight:700;margin-top:4px;min-height:14px;}
        .shop-card .tier{position:absolute;top:11px;right:12px;font-size:10px;font-weight:800;letter-spacing:1px;
          color:#cfe8b0;opacity:.8;}
        .shop-card .price{display:flex;align-items:center;gap:6px;margin-top:8px;font-size:16px;font-weight:800;color:#ffd24a;}
        .shop-card .price .c{width:15px;height:15px;border-radius:50%;
          background:radial-gradient(circle at 35% 30%,#ffe89a,#e8a81f 70%);}
        .shop-card .price.owned,.shop-card .price.maxed{color:#9fe8c0;}
        #shop-foot{padding:12px 26px 18px;display:flex;justify-content:flex-end;border-top:1px solid #ffffff18;}
        #shop-close{pointer-events:auto;cursor:pointer;padding:10px 26px;font-size:15px;font-weight:800;
          letter-spacing:1px;color:#10240f;border:none;border-radius:24px;
          background:linear-gradient(90deg,#a8e063,#76d35a);box-shadow:0 5px 0 #4a7a2e,0 7px 14px #0006;
          transition:transform .1s,box-shadow .1s,filter .15s;}
        #shop-close:hover{filter:brightness(1.1);transform:translateY(-1px);}
        #shop-close:active{transform:translateY(3px);box-shadow:0 2px 0 #4a7a2e;}
      </style>
      <div id="shop-bg"></div>
      <div id="shop-panel">
        <div id="shop-head">
          <div id="shop-title">Old Owl's Outfitters<small>SHOP · [P] / [ESC] TO CLOSE</small></div>
          <div id="shop-gold"><span class="coin">¢</span><span id="shop-gold-n">0</span></div>
        </div>
        <div id="shop-tabs"></div>
        <div id="shop-grid"></div>
        <div id="shop-foot"><button id="shop-close">DONE</button></div>
      </div>`;
    document.body.appendChild(root);
    this.root = root;
    this.gridEl = root.querySelector('#shop-grid');
    this.goldEl = root.querySelector('#shop-gold');
    this.goldNum = root.querySelector('#shop-gold-n');
    this.tabsEl = root.querySelector('#shop-tabs');
    root.querySelector('#shop-close').addEventListener('click', () => this.close());

    this.tabsEl.innerHTML = TABS.map((t) =>
      `<div class="shop-tab${t === this.tab ? ' active' : ''}" data-tab="${t}">${t}</div>`).join('');
    this.tabsEl.querySelectorAll('.shop-tab').forEach((el) =>
      el.addEventListener('click', () => { this.tab = el.dataset.tab; this._syncTabs(); this._render(); }));
  }

  open() { this.isOpen = true; this.root.classList.add('open'); this._render(); }
  close() { this.isOpen = false; this.root.classList.remove('open'); this.onClose?.(); }

  _syncTabs() {
    this.tabsEl.querySelectorAll('.shop-tab').forEach((el) =>
      el.classList.toggle('active', el.dataset.tab === this.tab));
  }

  // Build the catalog of cards (kind/category/affordability) for the current state.
  _catalog() {
    const gm = this.gm, items = [];
    // Permanent upgrades (Hero).
    for (const id of UPGRADE_ORDER) {
      const u = UPGRADES[id], tier = gm.upgradeTier(id), price = gm.upgradePrice(id);
      items.push({ cat: 'Hero', kind: 'upgrade', id, icon: u.icon, name: u.name, desc: u.desc,
        tier: `TIER ${tier}/${UPGRADE_MAX_TIER}`, preview: this._upgradePreview(id, tier),
        price, maxed: price == null });
    }
    // Weapon unlocks (Weapons).
    for (const w of SHOP_WEAPONS) {
      const owned = gm.isWeaponUnlocked(w.id);
      items.push({ cat: 'Weapons', kind: 'weapon', id: w.id, icon: w.icon, name: w.name,
        desc: w.desc, price: w.price, owned });
    }
    // Consumables (Supplies / Hero by item.cat).
    for (const c of CONSUMABLES) {
      items.push({ cat: c.cat, kind: 'consumable', id: c.id, icon: c.icon, name: c.name,
        desc: c.desc, price: c.price, effect: c.effect });
    }
    return items;
  }

  _upgradePreview(id, tier) {
    const u = UPGRADES[id];
    if (id === 'DAMAGE') {
      const cur = this.gm.playerDamageMult;
      return tier >= UPGRADE_MAX_TIER ? `DMG ×${cur.toFixed(2)}` : `DMG ×${cur.toFixed(2)} → ×${(cur + u.per).toFixed(2)}`;
    }
    if (id === 'HP') {
      const cur = this.gm.maxHp;
      return tier >= UPGRADE_MAX_TIER ? `${cur} HP` : `${cur} → ${cur + u.per} HP`;
    }
    const base = 1 + tier * u.per;
    return tier >= UPGRADE_MAX_TIER ? `SPD ${Math.round(base * 100)}%` : `SPD ${Math.round(base * 100)}% → ${Math.round((base + u.per) * 100)}%`;
  }

  _render() {
    this.goldNum.textContent = this.gm.gold.toLocaleString();
    const items = this._catalog().filter((i) => this.tab === 'All' || i.cat === this.tab);
    this.gridEl.innerHTML = '';
    for (const it of items) {
      const owned = it.owned, maxed = it.maxed;
      const affordable = !owned && !maxed && it.price != null && this.gm.gold >= it.price;
      const disabled = owned || maxed || !affordable;
      const card = document.createElement('div');
      card.className = 'shop-card' + (disabled ? ' disabled' : '');
      const priceHtml = owned
        ? `<div class="price owned">✓ OWNED</div>`
        : maxed
          ? `<div class="price maxed">MAXED</div>`
          : `<div class="price"><span class="c"></span>${it.price}</div>`;
      card.innerHTML =
        `${it.tier ? `<span class="tier">${it.tier}</span>` : ''}` +
        `<div class="ic">${it.icon}</div><div class="nm">${it.name}</div>` +
        `<div class="ds">${it.desc}</div>` +
        `<div class="prev">${it.preview || ''}</div>${priceHtml}`;
      if (!disabled) card.addEventListener('click', () => this._buy(it));
      this.gridEl.appendChild(card);
    }
  }

  _buy(it) {
    let ok = false;
    if (it.kind === 'upgrade') {
      ok = this.gm.buyUpgrade(it.id, this.player);
    } else if (it.kind === 'weapon') {
      if (this.gm.gold >= it.price && this.gm.spendGold(it.price)) {
        this.gm.unlockWeapon(it.id); ok = true;
        this.toasts?.weapon(it.name);
      }
    } else if (it.kind === 'consumable') {
      if (this.gm.gold >= it.price && this.gm.spendGold(it.price)) {
        this.gm.applyConsumable(it.effect, this.player, this.player.weapons); ok = true;
      }
    }
    if (ok) {
      this.goldEl.classList.remove('pulse'); void this.goldEl.offsetWidth; this.goldEl.classList.add('pulse');
      this._render();
      this.onPurchase?.();
    }
  }
}
