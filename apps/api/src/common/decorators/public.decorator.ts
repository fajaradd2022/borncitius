import { SetMetadata } from '@nestjs/common';

export const IS_PUBLIC_KEY = 'isPublic';

/** Menandai endpoint yang boleh diakses tanpa token (login, refresh, health). */
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);
