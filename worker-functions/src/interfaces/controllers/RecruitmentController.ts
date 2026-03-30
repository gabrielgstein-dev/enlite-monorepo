import { Request, Response } from 'express';
import { Pool } from 'pg';
import { DatabaseConnection } from '../../infrastructure/database/DatabaseConnection';
import { 
  parsePaginationOptions, 
  buildPaginationClause, 
  buildCountQuery, 
  createPaginatedResponse 
} from '../../infrastructure/utils/pagination';

/**
 * RecruitmentController
 * 
 * Endpoints para alimentar o AdminRecruitmentPage (Dashboard de Reclutamiento)
 * 
 * Endpoints:
 * - GET /api/admin/recruitment/clickup-cases - Lista casos ClickUp (casos ativos)
 * - GET /api/admin/recruitment/talentum-workers - Workers do Talentum
 * - GET /api/admin/recruitment/publications - Publicações por canal
 * - GET /api/admin/recruitment/encuadres - Base consolidada (encuadres)
 * - GET /api/admin/recruitment/progreso - Candidatos em progresso (NoTerminaronTalentum)
 * - GET /api/admin/recruitment/global-metrics - Métricas globais
 * - GET /api/admin/recruitment/case/:caseNumber - Análise detalhada de um caso
 * - GET /api/admin/recruitment/zones - Análise por zona
 * - POST /api/admin/recruitment/calculate-reemplazos - Calcular Sel/Rem por caso
 */
export class RecruitmentController {
  private db: Pool;

  constructor() {
    this.db = DatabaseConnection.getInstance().getPool();
  }

  /**
   * GET /api/admin/recruitment/clickup-cases
   * 
   * Retorna todos os casos ClickUp (job_postings com dados do ClickUp)
   * Equivalente ao CSV do ClickUp no dashboard original
   */
  async getClickUpCases(req: Request, res: Response): Promise<void> {
    try {
      const { startDate, endDate, status } = req.query;
      
      // Parse pagination options
      const paginationOptions = parsePaginationOptions(req.query);

      let baseQuery = `
        SELECT
          jp.id,
          jp.case_number,
          cs.clickup_task_id,
          jp.title,
          jp.status,
          jp.priority,
          p.diagnosis as diagnosis,
          p.zone_neighborhood as patient_zone,
          p.city_locality as patient_neighborhood,
          jp.worker_profile_sought,
          jp.schedule_days_hours,
          cs.source_created_at,
          cs.source_updated_at,
          jp.due_date,
          jp.search_start_date,
          cs.last_clickup_comment as last_comment,
          p.dependency_level as dependency,
          jp.priority,
          p.first_name as patient_name,
          c.name AS coordinator_name,
          jp.is_covered,
          jp.weekly_hours,
          jp.providers_needed,
          jp.active_providers,
          jp.authorized_period,
          jp.marketing_channel,
          jp.assignee,
          jp.daily_obs,
          jp.inferred_zone,
          p.first_name as patient_first_name,
          p.last_name as patient_last_name,
          p.dependency_level,
          p.clinical_segments,
          p.service_type,
          p.zone_neighborhood as patient_zone_detail
        FROM job_postings jp
        LEFT JOIN job_postings_clickup_sync cs ON cs.job_posting_id = jp.id
        LEFT JOIN patients p ON jp.patient_id = p.id
        LEFT JOIN coordinators c ON c.id = jp.coordinator_id
        WHERE jp.case_number IS NOT NULL
          AND jp.deleted_at IS NULL
      `;

      const params: any[] = [];
      let paramIndex = 1;

      // Filtro por status ClickUp
      if (status) {
        baseQuery += ` AND jp.status = $${paramIndex}`;
        params.push(status);
        paramIndex++;
      }

      // Filtro por data de início de busca
      if (startDate) {
        baseQuery += ` AND jp.search_start_date >= $${paramIndex}`;
        params.push(startDate);
        paramIndex++;
      }

      if (endDate) {
        baseQuery += ` AND jp.search_start_date <= $${paramIndex}`;
        params.push(endDate);
        paramIndex++;
      }

      // Adiciona paginação
      const paginationClause = buildPaginationClause(paginationOptions);
      const queryWithPagination = baseQuery + ` ORDER BY jp.case_number DESC ${paginationClause}`;

      // Executa queries em paralelo
      const [dataResult, countResult] = await Promise.all([
        this.db.query(queryWithPagination, params),
        this.db.query(`SELECT COUNT(*) as total FROM (${baseQuery.replace(/GROUP BY.*$/, 'LIMIT 1')}) as subq`, params)
      ]);

      const total = parseInt(countResult.rows[0]?.total || '0');
      const response = createPaginatedResponse(dataResult.rows, paginationOptions, total);

      res.status(200).json(response);
    } catch (error: any) {
      console.error('[RecruitmentController] Error fetching ClickUp cases:', error);
      const msg = (error.message || '').toLowerCase();
      if (msg.includes('page') || msg.includes('limit')) {
        res.status(400).json({ success: false, error: error.message });
      } else {
        res.status(500).json({ success: false, error: 'Failed to fetch ClickUp cases' });
      }
    }
  }

  /**
   * GET /api/admin/recruitment/talentum-workers
   * 
   * Retorna workers que passaram pelo Talentum
   * Equivalente ao CSV do Talentum no dashboard original
   */
  async getTalentumWorkers(req: Request, res: Response): Promise<void> {
    try {
      const { startDate, endDate } = req.query;
      
      // Parse pagination options
      const paginationOptions = parsePaginationOptions(req.query);

      let baseQuery = `
        SELECT 
          w.id,
          w.email,
          w.phone,
          w.overall_status,
          w.created_at,
          w.updated_at,
          -- Encuadres relacionados (casos que o worker participou)
          COALESCE(
            json_agg(
              DISTINCT jsonb_build_object(
                'case_number', jp.case_number,
                'interview_date', e.interview_date,
                'resultado', e.resultado
              )
            ) FILTER (WHERE e.id IS NOT NULL),
            '[]'
          ) as pre_screenings
        FROM workers w
        LEFT JOIN encuadres e ON w.id = e.worker_id
        LEFT JOIN job_postings jp ON e.job_posting_id = jp.id
        WHERE w.overall_status = 'ACTIVE'
      `;

      const params: any[] = [];
      let paramIndex = 1;

      if (startDate) {
        baseQuery += ` AND w.created_at >= $${paramIndex}`;
        params.push(startDate);
        paramIndex++;
      }

      if (endDate) {
        baseQuery += ` AND w.created_at <= $${paramIndex}`;
        params.push(endDate);
        paramIndex++;
      }

      baseQuery += ` GROUP BY w.id`;
      
      // Adiciona paginação
      const paginationClause = buildPaginationClause(paginationOptions);
      const queryWithPagination = baseQuery + ` ORDER BY w.created_at DESC ${paginationClause}`;

      // Executa queries em paralelo
      const [dataResult, countResult] = await Promise.all([
        this.db.query(queryWithPagination, params),
        this.db.query(`SELECT COUNT(DISTINCT w.id) as total FROM workers w WHERE w.overall_status = 'ACTIVE'`, params)
      ]);

      const total = parseInt(countResult.rows[0]?.total || '0');
      const response = createPaginatedResponse(dataResult.rows, paginationOptions, total);

      res.status(200).json(response);
    } catch (error: any) {
      console.error('[RecruitmentController] Error fetching Talentum workers:', error);
      if (error.message.includes('page') || error.message.includes('limit')) {
        res.status(400).json({
          success: false,
          error: 'Invalid pagination parameters',
          details: error.message
        });
      } else {
        res.status(500).json({
          success: false,
          error: 'Failed to fetch Talentum workers',
          details: error.message
        });
      }
    }
  }

  /**
   * GET /api/admin/recruitment/progreso
   * 
   * Retorna candidatos em progresso (NoTerminaronTalentum)
   * Workers que não completaram o funil do Talentum
   */
  async getProgresoWorkers(req: Request, res: Response): Promise<void> {
    try {
      const { startDate, endDate } = req.query;
      
      // Parse pagination options
      const paginationOptions = parsePaginationOptions(req.query);

      let baseQuery = `
        SELECT 
          w.id,
          w.email,
          w.phone,
          w.overall_status,
          w.created_at,
          w.updated_at
        FROM workers w
        WHERE w.overall_status = 'ACTIVE'
      `;

      const params: any[] = [];
      let paramIndex = 1;

      if (startDate) {
        baseQuery += ` AND w.created_at >= $${paramIndex}`;
        params.push(startDate);
        paramIndex++;
      }

      if (endDate) {
        baseQuery += ` AND w.created_at <= $${paramIndex}`;
        params.push(endDate);
        paramIndex++;
      }

      // Adiciona paginação
      const paginationClause = buildPaginationClause(paginationOptions);
      const queryWithPagination = baseQuery + ` ORDER BY w.created_at DESC ${paginationClause}`;

      // Executa queries em paralelo
      const [dataResult, countResult] = await Promise.all([
        this.db.query(queryWithPagination, params),
        this.db.query(`SELECT COUNT(*) as total FROM (${baseQuery.replace(/GROUP BY.*$/, 'LIMIT 1')}) as subq`, params)
      ]);

      const total = parseInt(countResult.rows[0]?.total || '0');
      const response = createPaginatedResponse(dataResult.rows, paginationOptions, total);

      res.status(200).json(response);
    } catch (error: any) {
      console.error('[RecruitmentController] Error fetching progreso workers:', error);
      if (error.message.includes('page') || error.message.includes('limit')) {
        res.status(400).json({
          success: false,
          error: 'Invalid pagination parameters',
          details: error.message
        });
      } else {
        res.status(500).json({
          success: false,
          error: 'Failed to fetch progreso workers',
          details: error.message
        });
      }
    }
  }

  /**
   * GET /api/admin/recruitment/publications
   * 
   * Retorna todas as publicações (_Publicaciones da Planilla Operativa)
   */
  async getPublications(req: Request, res: Response): Promise<void> {
    try {
      const { startDate, endDate, caseNumber } = req.query;
      
      // Parse pagination options
      const paginationOptions = parsePaginationOptions(req.query);

      let baseQuery = `
        SELECT 
          p.id,
          p.channel,
          p.group_name,
          p.group_geographic_zone,
          p.recruiter_name,
          p.published_at,
          p.observations,
          p.created_at,
          jp.case_number,
          jp.title,
          pt.zone_neighborhood as patient_zone
        FROM publications p
        LEFT JOIN job_postings jp ON p.job_posting_id = jp.id AND jp.deleted_at IS NULL
        LEFT JOIN patients pt ON jp.patient_id = pt.id
        WHERE 1=1
      `;

      const params: any[] = [];
      let paramIndex = 1;

      if (caseNumber) {
        baseQuery += ` AND jp.case_number = $${paramIndex}`;
        params.push(parseInt(caseNumber as string));
        paramIndex++;
      }

      if (startDate) {
        baseQuery += ` AND p.published_at >= $${paramIndex}`;
        params.push(startDate);
        paramIndex++;
      }

      if (endDate) {
        baseQuery += ` AND p.published_at <= $${paramIndex}`;
        params.push(endDate);
        paramIndex++;
      }

      // Adiciona paginação
      const paginationClause = buildPaginationClause(paginationOptions);
      const queryWithPagination = baseQuery + ` ORDER BY p.published_at DESC ${paginationClause}`;

      // Executa queries em paralelo
      const [dataResult, countResult] = await Promise.all([
        this.db.query(queryWithPagination, params),
        this.db.query(`SELECT COUNT(*) as total FROM publications p LEFT JOIN job_postings jp ON p.job_posting_id = jp.id AND jp.deleted_at IS NULL LEFT JOIN patients pt ON jp.patient_id = pt.id WHERE 1=1`, params)
      ]);

      const total = parseInt(countResult.rows[0]?.total || '0');
      const response = createPaginatedResponse(dataResult.rows, paginationOptions, total);

      res.status(200).json(response);
    } catch (error: any) {
      console.error('[RecruitmentController] Error fetching publications:', error);
      if (error.message.includes('page') || error.message.includes('limit')) {
        res.status(400).json({
          success: false,
          error: 'Invalid pagination parameters',
          details: error.message
        });
      } else {
        res.status(500).json({
          success: false,
          error: 'Failed to fetch publications',
          details: error.message
        });
      }
    }
  }

  /**
   * GET /api/admin/recruitment/encuadres
   * 
   * Retorna todos os encuadres (Base consolidada da Planilla Operativa)
   */
  async getEncuadres(req: Request, res: Response): Promise<void> {
    try {
      const { startDate, endDate, caseNumber, resultado } = req.query;
      
      // Parse pagination options
      const paginationOptions = parsePaginationOptions(req.query);

      let baseQuery = `
        SELECT 
          e.id,
          e.worker_id,
          e.job_posting_id,
          e.worker_raw_name,
          e.worker_raw_phone,
          e.occupation_raw,
          e.recruiter_name,
          c.name AS coordinator_name,
          e.recruitment_date,
          e.interview_date,
          e.interview_time,
          e.meet_link,
          e.attended,
          e.absence_reason,
          e.accepts_case,
          e.rejection_reason,
          e.resultado,
          e.redireccionamiento,
          e.has_cv,
          e.has_dni,
          e.has_cert_at,
          e.has_afip,
          e.has_cbu,
          e.has_ap,
          e.has_seguros,
          e.obs_reclutamiento,
          e.obs_encuadre,
          e.obs_adicionales,
          e.created_at,
          e.updated_at,
          jp.case_number,
          jp.title,
          p.zone_neighborhood as patient_zone,
          w.email as worker_email,
          w.phone as worker_phone
        FROM encuadres e
        LEFT JOIN job_postings jp ON e.job_posting_id = jp.id AND jp.deleted_at IS NULL
        LEFT JOIN workers w ON e.worker_id = w.id
        LEFT JOIN patients p ON jp.patient_id = p.id
        LEFT JOIN coordinators c ON c.id = e.coordinator_id
        WHERE 1=1
      `;

      const params: any[] = [];
      let paramIndex = 1;

      if (caseNumber) {
        baseQuery += ` AND jp.case_number = $${paramIndex}`;
        params.push(parseInt(caseNumber as string));
        paramIndex++;
      }

      if (resultado) {
        baseQuery += ` AND e.resultado = $${paramIndex}`;
        params.push(resultado);
        paramIndex++;
      }

      if (startDate) {
        baseQuery += ` AND e.interview_date >= $${paramIndex}`;
        params.push(startDate);
        paramIndex++;
      }

      if (endDate) {
        baseQuery += ` AND e.interview_date <= $${paramIndex}`;
        params.push(endDate);
        paramIndex++;
      }

      // Adiciona paginação
      const paginationClause = buildPaginationClause(paginationOptions);
      const queryWithPagination = baseQuery + ` ORDER BY e.interview_date DESC NULLS LAST ${paginationClause}`;

      // Executa queries em paralelo
      const [dataResult, countResult] = await Promise.all([
        this.db.query(queryWithPagination, params),
        this.db.query(`SELECT COUNT(*) as total FROM (${baseQuery.replace(/GROUP BY.*$/, 'LIMIT 1')}) as subq`, params)
      ]);

      const total = parseInt(countResult.rows[0]?.total || '0');
      const response = createPaginatedResponse(dataResult.rows, paginationOptions, total);

      res.status(200).json(response);
    } catch (error: any) {
      console.error('[RecruitmentController] Error fetching encuadres:', error);
      if (error.message.includes('page') || error.message.includes('limit')) {
        res.status(400).json({
          success: false,
          error: 'Invalid pagination parameters',
          details: error.message
        });
      } else {
        res.status(500).json({
          success: false,
          error: 'Failed to fetch encuadres',
          details: error.message
        });
      }
    }
  }

  /**
   * GET /api/admin/recruitment/global-metrics
   * 
   * Retorna métricas globais do dashboard
   */
  async getGlobalMetrics(req: Request, res: Response): Promise<void> {
    try {
      const { startDate, endDate } = req.query;

      // Casos ativos (BUSQUEDA ou REEMPLAZO)
      const activeCasesQuery = `
        SELECT 
          COUNT(*) FILTER (WHERE status IN ('BUSQUEDA', 'REEMPLAZO')) as active_cases_count,
          COUNT(*) FILTER (WHERE status = 'BUSQUEDA') as busqueda_count,
          COUNT(*) FILTER (WHERE status = 'REEMPLAZO') as reemplazo_count
        FROM job_postings
        WHERE case_number IS NOT NULL
          AND deleted_at IS NULL
      `;

      // Postulantes em Talentum
      let talentumQuery = `
        SELECT COUNT(*) as talentum_count
        FROM workers
        WHERE overall_status = 'ACTIVE'
      `;

      // Candidatos em progresso
      let progresoQuery = `
        SELECT COUNT(*) as progreso_count
        FROM workers
        WHERE overall_status = 'ACTIVE'
      `;

      // Publicações por canal
      let publicationsQuery = `
        SELECT 
          channel,
          COUNT(*) as count
        FROM publications
        WHERE 1=1
      `;

      // Encuadres (quantidade)
      let encuadresQuery = `
        SELECT COUNT(*) as encuadres_count
        FROM encuadres
        WHERE attended = true
      `;

      const params: any[] = [];
      let paramIndex = 1;

      // Aplicar filtros de data
      if (startDate || endDate) {
        if (startDate) {
          talentumQuery += ` AND created_at >= $${paramIndex}`;
          progresoQuery += ` AND created_at >= $${paramIndex}`;
          publicationsQuery += ` AND published_at >= $${paramIndex}`;
          encuadresQuery += ` AND interview_date >= $${paramIndex}`;
          params.push(startDate);
          paramIndex++;
        }

        if (endDate) {
          talentumQuery += ` AND created_at <= $${paramIndex}`;
          progresoQuery += ` AND created_at <= $${paramIndex}`;
          publicationsQuery += ` AND published_at <= $${paramIndex}`;
          encuadresQuery += ` AND interview_date <= $${paramIndex}`;
          params.push(endDate);
          paramIndex++;
        }
      }

      publicationsQuery += ` GROUP BY channel ORDER BY count DESC`;

      // Executar todas as queries
      const [activeCases, talentum, progreso, publications, encuadres] = await Promise.all([
        this.db.query(activeCasesQuery),
        this.db.query(talentumQuery, params),
        this.db.query(progresoQuery, params),
        this.db.query(publicationsQuery, params),
        this.db.query(encuadresQuery, params)
      ]);

      const metrics = {
        activeCasesCount: parseInt(activeCases.rows[0]?.active_cases_count || '0'),
        busquedaCount: parseInt(activeCases.rows[0]?.busqueda_count || '0'),
        reemplazoCount: parseInt(activeCases.rows[0]?.reemplazo_count || '0'),
        postulantesInTalentumCount: parseInt(talentum.rows[0]?.talentum_count || '0'),
        candidatosEnProgresoCount: parseInt(progreso.rows[0]?.progreso_count || '0'),
        cantidadEncuadres: parseInt(encuadres.rows[0]?.encuadres_count || '0'),
        publicationsByChannel: publications.rows.map(row => ({
          channel: row.channel || 'Desconocido',
          count: parseInt(row.count)
        })),
        totalPubs: publications.rows.reduce((sum, row) => sum + parseInt(row.count), 0)
      };

      res.status(200).json({
        success: true,
        data: metrics
      });
    } catch (error: any) {
      console.error('[RecruitmentController] Error fetching global metrics:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to fetch global metrics',
        details: error.message
      });
    }
  }

  /**
   * GET /api/admin/recruitment/case/:caseNumber
   * 
   * Retorna análise detalhada de um caso específico
   */
  async getCaseAnalysis(req: Request, res: Response): Promise<void> {
    try {
      const { caseNumber } = req.params;

      if (!caseNumber) {
        res.status(400).json({
          success: false,
          error: 'Case number is required'
        });
        return;
      }

      // Dados do caso (ClickUp)
      const caseQuery = `
        SELECT 
          jp.*,
          p.first_name as patient_first_name,
          p.last_name as patient_last_name,
          p.dependency_level,
          p.diagnosis as patient_diagnosis,
          p.zone_neighborhood
        FROM job_postings jp
        LEFT JOIN patients p ON jp.patient_id = p.id
        WHERE jp.case_number = $1
          AND jp.deleted_at IS NULL
      `;

      // Publicações do caso
      const publicationsQuery = `
        SELECT 
          channel,
          COUNT(*) as count
        FROM publications p
        INNER JOIN job_postings jp ON p.job_posting_id = jp.id
        WHERE jp.case_number = $1
          AND jp.deleted_at IS NULL
        GROUP BY channel
        ORDER BY count DESC
      `;

      // Histórico de publicações
      const publicationsHistoryQuery = `
        SELECT 
          p.channel,
          p.group_name,
          p.recruiter_name,
          p.published_at,
          p.observations
        FROM publications p
        INNER JOIN job_postings jp ON p.job_posting_id = jp.id
        WHERE jp.case_number = $1
          AND jp.deleted_at IS NULL
        ORDER BY p.published_at DESC
      `;

      // Encuadres do caso (resultados AT)
      const encuadresQuery = `
        SELECT 
          e.worker_raw_name,
          e.worker_raw_phone,
          e.interview_date,
          e.attended,
          e.resultado,
          e.rejection_reason,
          e.worker_raw_name as worker_name
        FROM encuadres e
        INNER JOIN job_postings jp ON e.job_posting_id = jp.id
        LEFT JOIN workers w ON e.worker_id = w.id
        WHERE jp.case_number = $1
          AND jp.deleted_at IS NULL
        ORDER BY e.interview_date DESC
      `;

      // Contadores de resultados
      const resultsQuery = `
        SELECT 
          COUNT(*) FILTER (WHERE resultado = 'SELECCIONADO') as seleccionados,
          COUNT(*) FILTER (WHERE resultado = 'REEMPLAZO') as reemplazos,
          COUNT(*) FILTER (WHERE attended = true) as invitados_attended,
          COUNT(*) as total_invitados
        FROM encuadres e
        INNER JOIN job_postings jp ON e.job_posting_id = jp.id
        WHERE jp.case_number = $1
          AND jp.deleted_at IS NULL
      `;

      // Postulados em Talentum para este caso
      const talentumQuery = `
        SELECT COUNT(DISTINCT e.worker_id) as postulados_count
        FROM encuadres e
        INNER JOIN job_postings jp ON e.job_posting_id = jp.id
        INNER JOIN workers w ON e.worker_id = w.id
        WHERE jp.case_number = $1
          AND jp.deleted_at IS NULL
          AND w.overall_status = 'ACTIVE'
      `;

      const [caseData, publications, publicationsHistory, encuadres, results, talentum] = await Promise.all([
        this.db.query(caseQuery, [parseInt(caseNumber)]),
        this.db.query(publicationsQuery, [parseInt(caseNumber)]),
        this.db.query(publicationsHistoryQuery, [parseInt(caseNumber)]),
        this.db.query(encuadresQuery, [parseInt(caseNumber)]),
        this.db.query(resultsQuery, [parseInt(caseNumber)]),
        this.db.query(talentumQuery, [parseInt(caseNumber)])
      ]);

      if (caseData.rows.length === 0) {
        res.status(404).json({
          success: false,
          error: 'Case not found'
        });
        return;
      }

      const analysis = {
        caseInfo: caseData.rows[0],
        publicationsByChannel: publications.rows.map(row => ({
          channel: row.channel || 'Desconocido',
          count: parseInt(row.count)
        })),
        publicationsHistory: publicationsHistory.rows,
        encuadres: encuadres.rows,
        metrics: {
          seleccionados: parseInt(results.rows[0]?.seleccionados || '0'),
          reemplazos: parseInt(results.rows[0]?.reemplazos || '0'),
          invitados: parseInt(results.rows[0]?.total_invitados || '0'),
          asistentes: parseInt(results.rows[0]?.invitados_attended || '0'),
          postuladosInTalentum: parseInt(talentum.rows[0]?.postulados_count || '0'),
          tasaAsistencia: results.rows[0]?.total_invitados > 0
            ? (parseInt(results.rows[0].invitados_attended) / parseInt(results.rows[0].total_invitados) * 100).toFixed(1)
            : '0'
        }
      };

      res.status(200).json({
        success: true,
        data: analysis
      });
    } catch (error: any) {
      console.error('[RecruitmentController] Error fetching case analysis:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to fetch case analysis',
        details: error.message
      });
    }
  }

  /**
   * GET /api/admin/recruitment/zones
   * 
   * Retorna análise por zona (distribuição territorial de casos)
   */
  async getZoneAnalysis(req: Request, res: Response): Promise<void> {
    try {
      const query = `
        SELECT 
          COALESCE(p.zone_neighborhood, 'Sin Zona') as zone,
          COUNT(*) as case_count,
          COUNT(*) FILTER (WHERE status IN ('BUSQUEDA', 'REEMPLAZO')) as active_count,
          json_agg(
            json_build_object(
              'case_number', case_number,
              'task_name', title,
              'status', status,
              'diagnosis', p.diagnosis,
              'patient_name', p.first_name
            )
          ) as cases
        FROM job_postings jp
        LEFT JOIN patients p ON jp.patient_id = p.id
        WHERE jp.case_number IS NOT NULL
          AND jp.deleted_at IS NULL
        GROUP BY COALESCE(p.zone_neighborhood, 'Sin Zona')
        ORDER BY case_count DESC
      `;

      const result = await this.db.query(query);

      const totalCases = result.rows.reduce((sum, row) => sum + parseInt(row.case_count), 0);
      const nullCount = result.rows.find(row => row.zone === 'Sin Zona')?.case_count || 0;

      const analysis = {
        zones: result.rows.map(row => ({
          zone: row.zone,
          caseCount: parseInt(row.case_count),
          activeCount: parseInt(row.active_count),
          percentage: ((parseInt(row.case_count) / totalCases) * 100).toFixed(1),
          cases: row.cases
        })),
        totalCases,
        nullCount: parseInt(nullCount),
        nullPercentage: ((parseInt(nullCount) / totalCases) * 100).toFixed(1),
        identifiedZones: result.rows.filter(row => row.zone !== 'Sin Zona').length
      };

      res.status(200).json({
        success: true,
        data: analysis
      });
    } catch (error: any) {
      console.error('[RecruitmentController] Error fetching zone analysis:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to fetch zone analysis',
        details: error.message
      });
    }
  }

  /**
   * POST /api/admin/recruitment/calculate-reemplazos
   * 
   * Calcula Seleccionados e Reemplazos por caso
   * Retorna cores condicionais para a tabela
   */
  async calculateReemplazos(req: Request, res: Response): Promise<void> {
    try {
      const query = `
        SELECT 
          jp.case_number,
          COUNT(*) FILTER (WHERE e.resultado = 'SELECCIONADO') as sel,
          COUNT(*) FILTER (WHERE e.resultado = 'REEMPLAZO') as rem,
          MAX(p.published_at) as last_pub_date,
          (
            SELECT p2.channel
            FROM publications p2
            WHERE p2.job_posting_id = jp.id
            ORDER BY p2.published_at DESC
            LIMIT 1
          ) as last_pub_channel
        FROM job_postings jp
        LEFT JOIN encuadres e ON jp.id = e.job_posting_id
        LEFT JOIN publications p ON jp.id = p.job_posting_id
        WHERE jp.case_number IS NOT NULL
          AND jp.status IN ('BUSQUEDA', 'REEMPLAZO')
          AND jp.deleted_at IS NULL
        GROUP BY jp.id, jp.case_number
        ORDER BY jp.case_number
      `;

      const result = await this.db.query(query);

      const reemplazos = result.rows.map(row => {
        const sel = parseInt(row.sel || '0');
        const rem = parseInt(row.rem || '0');
        const total = sel + rem;

        let color: 'red' | 'yellow' | 'green' = 'red';
        
        // Lógica de cores
        if (sel > 0 && rem > 0) {
          color = total >= 10 ? 'green' : 'yellow';
        }

        return {
          caseNumber: row.case_number,
          sel,
          rem,
          total,
          color,
          lastPubDate: row.last_pub_date,
          lastPubChannel: row.last_pub_channel
        };
      });

      res.status(200).json({
        success: true,
        data: reemplazos
      });
    } catch (error: any) {
      console.error('[RecruitmentController] Error calculating reemplazos:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to calculate reemplazos',
        details: error.message
      });
    }
  }
}
