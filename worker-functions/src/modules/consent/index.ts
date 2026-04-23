/**
 * consent module — scaffold placeholder (Passo 7 da migração modular).
 *
 * Domínio previsto pelo diagrama 7C (architecture/diagrams/stack/7C_backend.drawio):
 *   - Autorização do paciente / responsável titular
 *   - Termos de consentimento (LGPD Art. 7º-II, HIPAA Authorization)
 *   - Gestão de revogação de consent
 *   - Audit trail de autorizações (integra com audit-service)
 *
 * Ainda sem código — este barrel existe pra:
 *   1. Reservar a fronteira arquitetural.
 *   2. Bloquear por ESLint a criação acidental de código consent fora deste módulo.
 *   3. Facilitar extração futura como `consent-service` (GKE + Istio, PHI-tier).
 *
 * Novas features de consent devem nascer aqui — NÃO em src/domain/ ou src/infrastructure/.
 */

export {};
