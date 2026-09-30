'use strict';

/**
 * Converte um JSON de jogador já coletado (perfil+competições+jogos) num
 * registro "achatado", pronto para filtrar/ordenar numa tabela — usado
 * pelo backoffice (aba Ogol DB) do dashboard.
 */
function buildDatabaseRecord(json) {
  const dp = json.perfil?.dadosPessoais || {};

  const heightWeight = dp['Altura / Peso'] || '';
  const hwMatch = heightWeight.match(/(\d+)\s*cm\s*\/\s*(\d+)\s*kg/i);

  const dob = dp['Data de Nascimento'] || '';
  const ageMatch = dob.match(/\((\d+)\s*anos?\)/i);

  // historico[0] é a temporada mais recente (o ogol lista mais nova primeiro)
  const currentSeason = (json.perfil?.historico || [])[0] || {};
  const lastTransfer = (json.perfil?.transferencias || [])[0] || null;

  return {
    slug: json.slug,
    id: json.id,
    name: dp['Nome'] || json.slug,
    photoUrl: json.perfil?.foto || null,
    clubLogoUrl: json.perfil?.clubeEscudo || null,
    position: dp['Posição'] || null,
    foot: dp['Pé preferencial'] || null,
    heightCm: hwMatch ? parseInt(hwMatch[1], 10) : null,
    weightKg: hwMatch ? parseInt(hwMatch[2], 10) : null,
    age: ageMatch ? parseInt(ageMatch[1], 10) : null,
    club: dp['Clube atual'] || null,
    nationality: dp['Nacionalidade'] || null,
    contract: dp['Contrato'] || null,
    situation: dp['Situação'] || null,
    currentSeasonLabel: currentSeason.temporada || null,
    currentSeasonGames: currentSeason.jogos ?? null,
    currentSeasonGoals: currentSeason.gols ?? null,
    currentSeasonAssists: currentSeason.assistencias ?? null,
    lastTransferValue: lastTransfer?.valor || null,
    scrapedAt: json.scrapedAt,
  };
}

module.exports = { buildDatabaseRecord };
