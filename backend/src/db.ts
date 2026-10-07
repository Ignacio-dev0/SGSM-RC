import { PrismaClient, type Prisma } from '@prisma/client';

/** Cliente único de Prisma para todo el backend. */
export const prisma = new PrismaClient();

/** Cliente o transacción: los servicios aceptan ambos para poder componerse en una transacción. */
export type ClienteDb = PrismaClient | Prisma.TransactionClient;
