import { Pool } from 'pg';
import { config } from './config';

// Singleton: um único pool de conexões compartilhado por todo o serviço.
export const pool = new Pool(config.db);
