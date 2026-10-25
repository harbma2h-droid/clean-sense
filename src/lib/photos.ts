import type { ImageMetadata } from 'astro';

// Optional real photos in src/assets/images (jpg/jpeg/png/webp):
//   team.*      the team in front of the company vehicle → hero photo
//   team-van.*  a second team shot → "Our team" section (falls back to team.*)
// Without them, the hero keeps the interior photo and the team section stays hidden.
const pick = (found: Record<string, { default: ImageMetadata }>) => Object.values(found)[0]?.default;
export const teamPhoto: ImageMetadata | undefined = pick(import.meta.glob('../assets/images/team.{jpg,jpeg,png,webp}', { eager: true }));
export const teamSectionPhoto: ImageMetadata | undefined =
  pick(import.meta.glob('../assets/images/team-van.{jpg,jpeg,png,webp}', { eager: true })) ?? teamPhoto;
