import { Request, Response } from 'express';
import { JobScraperService, Job } from '../../infrastructure/scraper/JobScraperService';

// Cache simples em memória
interface CacheData {
  jobs: Job[];
  timestamp: number;
}

let cache: CacheData | null = null;
const CACHE_TTL = 5 * 60 * 1000; // 5 minutos

export class JobsController {
  private scraperService: JobScraperService;

  constructor() {
    this.scraperService = new JobScraperService();
  }

  async getJobs(req: Request, res: Response): Promise<void> {
    try {
      // Verificar cache
      if (cache && Date.now() - cache.timestamp < CACHE_TTL) {
        res.status(200).json({
          success: true,
          data: cache.jobs,
          cached: true,
          count: cache.jobs.length,
        });
        return;
      }

      // Fazer scraping
      const jobs = await this.scraperService.scrapeJobs();

      // Atualizar cache
      cache = {
        jobs,
        timestamp: Date.now(),
      };

      res.status(200).json({
        success: true,
        data: jobs,
        cached: false,
        count: jobs.length,
      });
    } catch (error: any) {
      console.error('Error fetching jobs:', error);
      
      // Se tiver cache, retornar mesmo expirado
      if (cache) {
        res.status(200).json({
          success: true,
          data: cache.jobs,
          cached: true,
          stale: true,
          count: cache.jobs.length,
        });
        return;
      }

      res.status(500).json({
        success: false,
        error: 'Failed to fetch jobs',
        message: error.message,
      });
    }
  }

  async refreshJobs(req: Request, res: Response): Promise<void> {
    try {
      // Forçar novo scraping
      const jobs = await this.scraperService.scrapeJobs();

      cache = {
        jobs,
        timestamp: Date.now(),
      };

      res.status(200).json({
        success: true,
        data: jobs,
        count: jobs.length,
      });
    } catch (error: any) {
      console.error('Error refreshing jobs:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to refresh jobs',
        message: error.message,
      });
    }
  }
}
