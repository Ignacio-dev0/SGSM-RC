import { PrismaClient } from '@prisma/client';

/** Cliente único de Prisma para todo el backend. */
export const prisma = new PrismaClient();
