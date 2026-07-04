// Registry of monochrome SVG icons (assets/icon/<author>/<name>.svg), tinted via
// CSS mask-image + currentColor so each usage inherits the color/size already set
// by its surrounding element (see .fd-icon in Theme.js).
import ammoBox from '../../assets/icon/sbed/ammo-box.svg';
import cancel from '../../assets/icon/sbed/cancel.svg';
import hearts from '../../assets/icon/skoll/hearts.svg';
import archeryTarget from '../../assets/icon/lorc/archery-target.svg';
import bellShield from '../../assets/icon/lorc/bell-shield.svg';
import cog from '../../assets/icon/lorc/cog.svg';
import crossedSwords from '../../assets/icon/lorc/crossed-swords.svg';
import fireSilhouette from '../../assets/icon/lorc/fire-silhouette.svg';
import king from '../../assets/icon/lorc/king.svg';
import minotaur from '../../assets/icon/lorc/minotaur.svg';
import moebiusStar from '../../assets/icon/lorc/moebius-star.svg';
import mushroom from '../../assets/icon/lorc/mushroom.svg';
import owl from '../../assets/icon/lorc/owl.svg';
import pawPrint from '../../assets/icon/lorc/paw-print.svg';
import ribbon from '../../assets/icon/lorc/ribbon.svg';
import run from '../../assets/icon/lorc/run.svg';
import skullCrossedBones from '../../assets/icon/lorc/skull-crossed-bones.svg';
import spikyExplosion from '../../assets/icon/lorc/spiky-explosion.svg';
import playButton from '../../assets/icon/guard13007/play-button.svg';
import pistolGun from '../../assets/icon/john-colburn/pistol-gun.svg';
import bowArrow from '../../assets/icon/delapouite/bow-arrow.svg';
import cage from '../../assets/icon/delapouite/cage.svg';
import checkMark from '../../assets/icon/delapouite/check-mark.svg';
import creditsCurrency from '../../assets/icon/delapouite/credits-currency.svg';
import flowerEmblem from '../../assets/icon/delapouite/flower-emblem.svg';
import foxTail from '../../assets/icon/delapouite/fox-tail.svg';
import house from '../../assets/icon/delapouite/house.svg';
import photoCamera from '../../assets/icon/delapouite/photo-camera.svg';
import plainArrow from '../../assets/icon/delapouite/plain-arrow.svg';
import shoppingCart from '../../assets/icon/delapouite/shopping-cart.svg';
import upgrade from '../../assets/icon/delapouite/upgrade.svg';
import warlockEye from '../../assets/icon/delapouite/warlock-eye.svg';

export const ICONS = {
  'ammo-box': ammoBox,
  cancel,
  hearts,
  'archery-target': archeryTarget,
  'bell-shield': bellShield,
  cog,
  'crossed-swords': crossedSwords,
  'fire-silhouette': fireSilhouette,
  king,
  minotaur,
  'moebius-star': moebiusStar,
  mushroom,
  owl,
  'paw-print': pawPrint,
  ribbon,
  run,
  'skull-crossed-bones': skullCrossedBones,
  'spiky-explosion': spikyExplosion,
  'play-button': playButton,
  'pistol-gun': pistolGun,
  'bow-arrow': bowArrow,
  cage,
  'check-mark': checkMark,
  'credits-currency': creditsCurrency,
  'flower-emblem': flowerEmblem,
  'fox-tail': foxTail,
  house,
  'photo-camera': photoCamera,
  'plain-arrow': plainArrow,
  'shopping-cart': shoppingCart,
  upgrade,
  'warlock-eye': warlockEye,
};

// Returns markup for a tinted icon span. `name` must be a key in ICONS.
// opts.className: extra class(es) to append (e.g. to inherit a specific element's color).
// opts.style: extra inline CSS appended after the mask-image rules (e.g. transform flip).
export function icon(name, { className = '', style = '' } = {}) {
  const url = ICONS[name];
  if (!url) throw new Error(`icon(): unknown icon "${name}"`);
  const cls = className ? `fd-icon ${className}` : 'fd-icon';
  return `<span class="${cls}" style="-webkit-mask-image:url('${url}');mask-image:url('${url}');${style}"></span>`;
}
