import { itemIconUrl, itemName } from '../../lib/items';

export function ItemIcon({
  itemId,
  size = 32,
  className,
}: {
  itemId: number;
  size?: number;
  className?: string;
}) {
  return (
    <img
      className={['gms-item-icon', className].filter(Boolean).join(' ')}
      src={itemIconUrl(itemId)}
      alt={itemName(itemId)}
      width={size}
      height={size}
      style={{ width: size, height: size }}
      loading="lazy"
      decoding="async"
      onError={(e) => {
        e.currentTarget.style.opacity = '0.25';
      }}
    />
  );
}
