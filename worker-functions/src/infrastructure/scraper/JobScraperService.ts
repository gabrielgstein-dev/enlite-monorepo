import axios from 'axios';
import * as cheerio from 'cheerio';

export interface Job {
  code: string;
  title: string;
  workerType: string;
  provincia: string;
  localidad: string;
  workerSex: string;
  pathologies: string;
  description: string;
  service: string;
  daysAndHours: string;
  ageRange: string;
  profile: string;
  whatsappLink: string;
  detailLink: string;
}

export class JobScraperService {
  private readonly baseUrl = 'https://jobs.enlite.health/es/';

  async scrapeJobs(): Promise<Job[]> {
    const allJobs: Job[] = [];
    const seenCodes = new Set<string>();
    let page = 1;
    const maxPages = 10; // Limite de segurança

    try {
      while (page <= maxPages) {
        const pageUrl = page === 1 ? this.baseUrl : `${this.baseUrl}?page=${page}`;
        console.log(`🕷️  Scraping página ${page}: ${pageUrl}`);

        const response = await axios.get(pageUrl, {
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
          },
          timeout: 30000
        });

        const $ = cheerio.load(response.data);
        const pageJobs: Job[] = [];

        $('.accordion').each((_, elem) => {
          const $btn = $(elem);
          const $panel = $btn.next('.panel');

          const code = $btn.attr('data-code') || '';
          if (!code || seenCodes.has(code)) return;

          seenCodes.add(code);

          const job: Job = {
            code,
            title: $btn.text().trim(),
            workerType: $btn.attr('data-worker-type') || '',
            provincia: $btn.attr('data-provincia') || '',
            localidad: $btn.attr('data-localidad') || '',
            workerSex: $btn.attr('data-worker-sex') || '',
            pathologies: $btn.attr('data-pathologies') || '',
            description: $btn.attr('data-description') || '',
            service: $btn.attr('data-service') || '',
            daysAndHours: '',
            ageRange: '',
            profile: '',
            whatsappLink: '',
            detailLink: `https://jobs.enlite.health/es/vagas/${code}/`
          };

          // Extrair dados do panel
          $panel.find('p').each((_, p) => {
            const text = $(p).text();
            if (text.includes('Días y Horarios:') || text.includes('Días y Horarios')) {
              job.daysAndHours = text.replace(/Días y Horarios:?\s*/i, '').trim();
            } else if (text.includes('Franja Etaria:') || text.includes('Franja Etaria')) {
              job.ageRange = text.replace(/Franja Etaria:?\s*/i, '').trim();
            } else if (text.includes('Perfil Buscado:') || text.includes('Perfil Buscado')) {
              job.profile = text.replace(/Perfil Buscado:?\s*/i, '').trim();
            }
          });

          // Extrair link WhatsApp
          const $whatsappLink = $panel.find('a[href*="wa.me"]');
          if ($whatsappLink.length) {
            job.whatsappLink = $whatsappLink.attr('href') || '';
          }

          pageJobs.push(job);
        });

        console.log(`   ✅ ${pageJobs.length} vagas novas na página ${page}`);

        if (pageJobs.length === 0) {
          console.log(`   🛑 Sem vagas novas, parando.`);
          break;
        }

        allJobs.push(...pageJobs);
        page++;

        // Delay entre requisições para não sobrecarregar o servidor
        if (page <= maxPages) {
          await new Promise(resolve => setTimeout(resolve, 1000));
        }
      }

      console.log(`\n🎉 Total: ${allJobs.length} vagas únicas`);
      return allJobs;

    } catch (error) {
      console.error('Error scraping jobs:', error);
      // Retorna o que conseguimos coletar mesmo com erro
      if (allJobs.length > 0) {
        console.log(`⚠️  Retornando ${allJobs.length} vagas coletadas antes do erro`);
        return allJobs;
      }
      throw new Error('Failed to scrape jobs from external source');
    }
  }
}
