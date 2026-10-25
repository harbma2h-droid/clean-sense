import type { ImageMetadata } from 'astro';

// Optional real photos. Drop src/assets/images/team.jpg (or .jpeg/.png/.webp) into the project and
// the site uses it: in the hero and in the "Our team" section. Without it, those fall back or hide.
const found = import.meta.glob<{ default: ImageMetadata }>('../assets/images/team.{jpg,jpeg,png,webp}', { eager: true });
export const teamPhoto: ImageMetadata | undefined = Object.values(found)[0]?.default;
