import { itemIconUrl, itemName } from '../../lib/items';
import { stackIconUrl, useStackIcons } from '../../lib/stackIcons';

/** Every item icon in the app draws into the same box. */
export const ITEM_ICON_SIZE = 32;

/**
 * A fixed `size` square with the art contained inside it, so icons line up
 * across every panel while keeping their own aspect ratio — wiki art ranges
 * from roughly 11x9 to 36x32 and would otherwise be stretched or ragged.
 */
export function ItemIcon({
  itemId,
  size = ITEM_ICON_SIZE,
  quantity,
  className,
}: {
  itemId: number;
  size?: number;
  /** When given, the art matches the stack size the way the game does. */
  quantity?: number;
  className?: string;
}) {
  // Subscribed so the icon redraws once the stack table has loaded.
  useStackIcons();
  const stacked = quantity === undefined ? undefined : stackIconUrl(itemId, quantity);

  return (
    <img
      className={['gms-item-icon', className].filter(Boolean).join(' ')}
      src={stacked ?? itemIconUrl(itemId)}
      alt={itemName(itemId)}
      width={size}
      height={size}
      style={{ width: size, height: size, objectFit: 'contain' }}
      loading="lazy"
      decoding="async"
      onError={(e) => {
        // Wiki art can go missing between syncs: fall back to the plain icon
        // once, and only dim it if that fails too, so this cannot loop.
        const img = e.currentTarget;
        const fallback = itemIconUrl(itemId);
        if (stacked && !img.src.endsWith(fallback)) {
          img.src = fallback;
          return;
        }
        img.style.opacity = '0.25';
      }}
    />
  );
}
