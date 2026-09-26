import { SETUP_VIDEO_URL } from '../lib/constants';

export function SetupVideoFrame({ className }: { className?: string }) {
  return (
    <iframe
      className={className}
      src={SETUP_VIDEO_URL}
      title="How to setup"
      allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
      allowFullScreen
      loading="lazy"
      referrerPolicy="strict-origin-when-cross-origin"
    />
  );
}
