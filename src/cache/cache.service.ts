import { Injectable, Inject, Logger } from '@nestjs/common';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { Cache } from 'cache-manager';

@Injectable()
export class CacheService {
  private readonly logger = new Logger(CacheService.name);
  private readonly keyRegistry = new Set<string>();

  constructor(
    @Inject(CACHE_MANAGER)
    private readonly cacheManager: Cache,
  ) {}

  async get<T>(key: string): Promise<T | undefined> {
    try {
      return await this.cacheManager.get<T>(key);
    } catch (error) {
      this.logger.error(`Cache get error for key ${key}: ${error.message}`);
      return undefined;
    }
  }

  async set(key: string, value: any, ttl?: number): Promise<void> {
    try {
      await this.cacheManager.set(key, value, ttl);
      this.keyRegistry.add(key);
    } catch (error) {
      this.logger.error(`Cache set error for key ${key}: ${error.message}`);
    }
  }

  async del(key: string): Promise<void> {
    try {
      await this.cacheManager.del(key);
      this.keyRegistry.delete(key);
    } catch (error) {
      this.logger.error(`Cache delete error for key ${key}: ${error.message}`);
    }
  }

  async delMany(keys: string[]): Promise<void> {
    try {
      await Promise.all(keys.map((key) => this.del(key)));
    } catch (error) {
      this.logger.error(`Cache delete many error: ${error.message}`);
    }
  }

  async delByPattern(pattern: string): Promise<void> {
    try {
      const matchedKeys = Array.from(this.keyRegistry).filter((key) =>
        key.includes(pattern),
      );

      if (matchedKeys.length > 0) {
        await this.delMany(matchedKeys);
        this.logger.debug(
          `Deleted ${matchedKeys.length} keys matching pattern: ${pattern}`,
        );
      }
    } catch (error) {
      this.logger.error(`Cache delete by pattern error: ${error.message}`);
    }
  }

  async reset(): Promise<void> {
    try {
      const allKeys = Array.from(this.keyRegistry);
      await this.delMany(allKeys);
      this.keyRegistry.clear();
      this.logger.log('Cache reset successful');
    } catch (error) {
      this.logger.error(`Cache reset error: ${error.message}`);
    }
  }

  getRegisteredKeys(): string[] {
    return Array.from(this.keyRegistry);
  }
}
