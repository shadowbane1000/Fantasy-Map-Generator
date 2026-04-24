import { AnthropicClient } from "./anthropic-client";
import { getApiKey } from "./api-key";
import { ChatController } from "./chat-controller";
import { mountChatWindow } from "./chat-window";
import { ToolRegistry } from "./tools";
import { addBiomeTool } from "./tools/add-biome";
import { addBurgTool } from "./tools/add-burg";
import { addCultureTool } from "./tools/add-culture";
import { addHillTool } from "./tools/add-hill";
import { addMarkerTool } from "./tools/add-marker";
import { addPitTool } from "./tools/add-pit";
import { addProvinceTool } from "./tools/add-province";
import { addRangeTool } from "./tools/add-range";
import { addRegimentTool } from "./tools/add-regiment";
import { addReligionTool } from "./tools/add-religion";
import { addRouteTool } from "./tools/add-route";
import { addRulerTool } from "./tools/add-ruler";
import { addStateTool } from "./tools/add-state";
import { addStraitTool } from "./tools/add-strait";
import { addTroughTool } from "./tools/add-trough";
import { addZoneTool } from "./tools/add-zone";
import { applyLayersPresetTool } from "./tools/apply-layers-preset";
import { clearHeightmapTool } from "./tools/clear-heightmap";
import { clearRulersTool } from "./tools/clear-rulers";
import { exportMapTool } from "./tools/export-map";
import { findAdjacentEntitiesTool } from "./tools/find-adjacent-entities";
import { findBurgsByCultureTool } from "./tools/find-burgs-by-culture";
import { findBurgsByFeatureTool } from "./tools/find-burgs-by-feature";
import { findBurgsByPopulationRangeTool } from "./tools/find-burgs-by-population-range";
import { findBurgsByReligionTool } from "./tools/find-burgs-by-religion";
import { findBurgsByStateTool } from "./tools/find-burgs-by-state";
import { findBurgsByTypeTool } from "./tools/find-burgs-by-type";
import { findBurgsInAreaTool } from "./tools/find-burgs-in-area";
import { findCellAtCoordsTool } from "./tools/find-cell-at-coords";
import { findCellsAdjacentToEntityTool } from "./tools/find-cells-adjacent-to-entity";
import { findCellsByBiomeTool } from "./tools/find-cells-by-biome";
import { findCellsByFeatureTool } from "./tools/find-cells-by-feature";
import { findCellsByHeightRangeTool } from "./tools/find-cells-by-height-range";
import { findCellsByPopulationRangeTool } from "./tools/find-cells-by-population-range";
import { findCellsByPrecipitationRangeTool } from "./tools/find-cells-by-precipitation-range";
import { findCellsByTemperatureRangeTool } from "./tools/find-cells-by-temperature-range";
import { findCellsInRadiusTool } from "./tools/find-cells-in-radius";
import { findCoastCellsTool } from "./tools/find-coast-cells";
import { findCulturesByTypeTool } from "./tools/find-cultures-by-type";
import { findCulturesInAreaTool } from "./tools/find-cultures-in-area";
import { findHighestPeaksTool } from "./tools/find-highest-peaks";
import { findLargestBurgsTool } from "./tools/find-largest-burgs";
import { findLargestCulturesTool } from "./tools/find-largest-cultures";
import { findLargestFeaturesTool } from "./tools/find-largest-features";
import { findLargestProvincesTool } from "./tools/find-largest-provinces";
import { findLargestReligionsTool } from "./tools/find-largest-religions";
import { findLargestStatesTool } from "./tools/find-largest-states";
import { findLongestRiversTool } from "./tools/find-longest-rivers";
import { findMarkersByStateTool } from "./tools/find-markers-by-state";
import { findMarkersByTypeTool } from "./tools/find-markers-by-type";
import { findMarkersInAreaTool } from "./tools/find-markers-in-area";
import { findNearestBurgTool } from "./tools/find-nearest-burg";
import { findNearestMarkerTool } from "./tools/find-nearest-marker";
import { findNearestRiverTool } from "./tools/find-nearest-river";
import { findNotesByPrefixTool } from "./tools/find-notes-by-prefix";
import { findOrphanCellsTool } from "./tools/find-orphan-cells";
import { findProvincesByStateTool } from "./tools/find-provinces-by-state";
import { findProvincesInAreaTool } from "./tools/find-provinces-in-area";
import { findRegimentsByStateTool } from "./tools/find-regiments-by-state";
import { findRegimentsByTypeTool } from "./tools/find-regiments-by-type";
import { findReligionsByCultureTool } from "./tools/find-religions-by-culture";
import { findReligionsByTypeTool } from "./tools/find-religions-by-type";
import { findReligionsInAreaTool } from "./tools/find-religions-in-area";
import { findRiversByBasinTool } from "./tools/find-rivers-by-basin";
import { findRiversByStateTool } from "./tools/find-rivers-by-state";
import { findRiversInAreaTool } from "./tools/find-rivers-in-area";
import { findRoutesByGroupTool } from "./tools/find-routes-by-group";
import { findStatesByCultureTool } from "./tools/find-states-by-culture";
import { findStatesByTypeTool } from "./tools/find-states-by-type";
import { findStatesInAreaTool } from "./tools/find-states-in-area";
import { findZonesByTypeTool } from "./tools/find-zones-by-type";
import { focusOnMapTool } from "./tools/focus-on-map";
import { getBiomeDistributionTool } from "./tools/get-biome-distribution";
import { getBiomeInfoTool } from "./tools/get-biome-info";
import { getBurgDistributionTool } from "./tools/get-burg-distribution";
import { getBurgInfoTool } from "./tools/get-burg-info";
import { getCellInfoTool } from "./tools/get-cell-info";
import { getClimateStatsTool } from "./tools/get-climate-stats";
import { getCultureDistributionTool } from "./tools/get-culture-distribution";
import { getCultureInfoTool } from "./tools/get-culture-info";
import { getDiplomacyBetweenTool } from "./tools/get-diplomacy-between";
import { getEntityBboxTool } from "./tools/get-entity-bbox";
import { getEntityCellsTool } from "./tools/get-entity-cells";
import { getEntityCentroidTool } from "./tools/get-entity-centroid";
import { getFeatureDistributionTool } from "./tools/get-feature-distribution";
import { getFeatureInfoTool } from "./tools/get-feature-info";
import { getLayerStyleTool } from "./tools/get-layer-style";
import { getMapInfoTool } from "./tools/get-map-info";
import { getMarkerInfoTool } from "./tools/get-marker-info";
import { getNoteInfoTool } from "./tools/get-note-info";
import { getPopulationStatsTool } from "./tools/get-population-stats";
import { getProvinceDistributionTool } from "./tools/get-province-distribution";
import { getProvinceInfoTool } from "./tools/get-province-info";
import { getRegimentInfoTool } from "./tools/get-regiment-info";
import { getReligionDistributionTool } from "./tools/get-religion-distribution";
import { getReligionInfoTool } from "./tools/get-religion-info";
import { getRiverDistributionTool } from "./tools/get-river-distribution";
import { getRiverInfoTool } from "./tools/get-river-info";
import { getRouteInfoTool } from "./tools/get-route-info";
import { getStateDistributionTool } from "./tools/get-state-distribution";
import { getStateInfoTool } from "./tools/get-state-info";
import { getTerrainStatsTool } from "./tools/get-terrain-stats";
import { getZoneDistributionTool } from "./tools/get-zone-distribution";
import { getZoneInfoTool } from "./tools/get-zone-info";
import { invertHeightmapTool } from "./tools/invert-heightmap";
import { listBiomesTool } from "./tools/list-biomes";
import { listBurgsTool } from "./tools/list-burgs";
import { listCulturesTool } from "./tools/list-cultures";
import { listCulturesSetsTool } from "./tools/list-cultures-sets";
import { listDiplomacyTool } from "./tools/list-diplomacy";
import { listEmblemShapesTool } from "./tools/list-emblem-shapes";
import { listFeaturesTool } from "./tools/list-features";
import { listHeightmapTemplatesTool } from "./tools/list-heightmap-templates";
import { listMarkerPinsTool } from "./tools/list-marker-pins";
import { listMarkerTypesTool } from "./tools/list-marker-types";
import { listMarkersTool } from "./tools/list-markers";
import { listNotesTool } from "./tools/list-notes";
import { listProvincesTool } from "./tools/list-provinces";
import { listRegimentUnitsTool } from "./tools/list-regiment-units";
import { listRegimentsTool } from "./tools/list-regiments";
import { listReligionsTool } from "./tools/list-religions";
import { listRiversTool } from "./tools/list-rivers";
import { listRoutesTool } from "./tools/list-routes";
import { listRulersTool } from "./tools/list-rulers";
import { listStatesTool } from "./tools/list-states";
import { listStylePresetsTool } from "./tools/list-style-presets";
import { listZonesTool } from "./tools/list-zones";
import { loadMapTool } from "./tools/load-map";
import { maskHeightmapTool } from "./tools/mask-heightmap";
import { measureDistanceTool } from "./tools/measure-distance";
import { mergeStatesTool } from "./tools/merge-states";
import { modifyHeightmapTool } from "./tools/modify-heightmap";
import { moveBurgTool } from "./tools/move-burg";
import { moveMarkerTool } from "./tools/move-marker";
import { moveRegimentTool } from "./tools/move-regiment";
import { regenerateAllBurgNamesTool } from "./tools/regenerate-all-burg-names";
import { regenerateAllCultureNamesTool } from "./tools/regenerate-all-culture-names";
import { regenerateAllProvinceNamesTool } from "./tools/regenerate-all-province-names";
import { regenerateAllStateNamesTool } from "./tools/regenerate-all-state-names";
import { regenerateBurgCoaTool } from "./tools/regenerate-burg-coa";
import { regenerateBurgNameTool } from "./tools/regenerate-burg-name";
import { regenerateDomainTool } from "./tools/regenerate-domain";
import { regenerateEmblemsTool } from "./tools/regenerate-emblems";
import { regenerateMapTool } from "./tools/regenerate-map";
import { regenerateProvinceCoaTool } from "./tools/regenerate-province-coa";
import { regenerateProvinceNameTool } from "./tools/regenerate-province-name";
import { regenerateRegimentNamesTool } from "./tools/regenerate-regiment-names";
import { regenerateReligionNamesTool } from "./tools/regenerate-religion-names";
import { regenerateRiverNamesTool } from "./tools/regenerate-river-names";
import { regenerateStateCoaTool } from "./tools/regenerate-state-coa";
import { regenerateStateNameTool } from "./tools/regenerate-state-name";
import { regenerateZonesTool } from "./tools/regenerate-zones";
import { removeBiomeTool } from "./tools/remove-biome";
import { removeBurgTool } from "./tools/remove-burg";
import { removeCultureTool } from "./tools/remove-culture";
import { removeMarkerTool } from "./tools/remove-marker";
import { removeNoteTool } from "./tools/remove-note";
import { removeProvinceTool } from "./tools/remove-province";
import { removeRegimentTool } from "./tools/remove-regiment";
import { removeReligionTool } from "./tools/remove-religion";
import { removeRiverTool } from "./tools/remove-river";
import { removeRouteTool } from "./tools/remove-route";
import { removeRulerTool } from "./tools/remove-ruler";
import { removeStateTool } from "./tools/remove-state";
import { removeZoneTool } from "./tools/remove-zone";
import { renameBiomeTool } from "./tools/rename-biome";
import { renameBurgTool } from "./tools/rename-burg";
import { renameCultureTool } from "./tools/rename-culture";
import { renameProvinceTool } from "./tools/rename-province";
import { renameRegimentTool } from "./tools/rename-regiment";
import { renameReligionTool } from "./tools/rename-religion";
import { renameRiverTool } from "./tools/rename-river";
import { renameRouteTool } from "./tools/rename-route";
import { renameStateTool } from "./tools/rename-state";
import { renameZoneTool } from "./tools/rename-zone";
import { saveMapTool } from "./tools/save-map";
import { setBiomeColorTool } from "./tools/set-biome-color";
import { setBiomeCostTool } from "./tools/set-biome-cost";
import { setBiomeHabitabilityTool } from "./tools/set-biome-habitability";
import { setBiomeIconsTool } from "./tools/set-biome-icons";
import { setBiomeIconsDensityTool } from "./tools/set-biome-icons-density";
import { setBurgCoaCustomTool } from "./tools/set-burg-coa-custom";
import { setBurgCultureTool } from "./tools/set-burg-culture";
import { setBurgFeatureTool } from "./tools/set-burg-feature";
import { setBurgGroupTool } from "./tools/set-burg-group";
import { setBurgPopulationTool } from "./tools/set-burg-population";
import { setBurgPortTool } from "./tools/set-burg-port";
import { setBurgTypeTool } from "./tools/set-burg-type";
import { setCellHeightTool } from "./tools/set-cell-height";
import { setCellsDensityTool } from "./tools/set-cells-density";
import { setClimateTool } from "./tools/set-climate";
import { setCultureBaseTool } from "./tools/set-culture-base";
import { setCultureCenterTool } from "./tools/set-culture-center";
import { setCultureColorTool } from "./tools/set-culture-color";
import { setCultureOriginsTool } from "./tools/set-culture-origins";
import { setCultureShieldTool } from "./tools/set-culture-shield";
import { setCultureTypeTool } from "./tools/set-culture-type";
import { setCulturesSetTool } from "./tools/set-cultures-set";
import { setDefaultEmblemShapeTool } from "./tools/set-default-emblem-shape";
import { setDiplomacyTool } from "./tools/set-diplomacy";
import { setEntityExpansionismTool } from "./tools/set-entity-expansionism";
import { setEntityLockTool } from "./tools/set-entity-lock";
import { setFontFamilyTool } from "./tools/set-font-family";
import { setFontSizeTool } from "./tools/set-font-size";
import { setGeneratorRatesTool } from "./tools/set-generator-rates";
import { setGeographyTool } from "./tools/set-geography";
import { setHeightExponentTool } from "./tools/set-height-exponent";
import { setHeightmapOptionsTool } from "./tools/set-heightmap-options";
import { setHeightmapTemplateTool } from "./tools/set-heightmap-template";
import { setLabelTextTool } from "./tools/set-label-text";
import { setLayerFillTool } from "./tools/set-layer-fill";
import { setLayerFilterTool } from "./tools/set-layer-filter";
import { setLayerOpacityTool } from "./tools/set-layer-opacity";
import { setLayerStrokeColorTool } from "./tools/set-layer-stroke-color";
import { setLayerStrokeDasharrayTool } from "./tools/set-layer-stroke-dasharray";
import { setLayerStrokeWidthTool } from "./tools/set-layer-stroke-width";
import { setLayerVisibilityTool } from "./tools/set-layer-visibility";
import { setMapNameTool } from "./tools/set-map-name";
import { setMarkerColorsTool } from "./tools/set-marker-colors";
import { setMarkerIconTool } from "./tools/set-marker-icon";
import { setMarkerIconSizeTool } from "./tools/set-marker-icon-size";
import { setMarkerLockTool } from "./tools/set-marker-lock";
import { setMarkerNoteTool } from "./tools/set-marker-note";
import { setMarkerPinTool } from "./tools/set-marker-pin";
import { setMarkerPinnedTool } from "./tools/set-marker-pinned";
import { setMarkerShiftTool } from "./tools/set-marker-shift";
import { setMarkerSizeTool } from "./tools/set-marker-size";
import { setMarkerTypeTool } from "./tools/set-marker-type";
import { setMeasurementUnitsTool } from "./tools/set-measurement-units";
import { setNoteTool } from "./tools/set-note";
import { setOnloadBehaviorTool } from "./tools/set-onload-behavior";
import { setPrecipitationTool } from "./tools/set-precipitation";
import { setProvinceCapitalTool } from "./tools/set-province-capital";
import { setProvinceCoaCustomTool } from "./tools/set-province-coa-custom";
import { setProvinceColorTool } from "./tools/set-province-color";
import { setProvinceFormTool } from "./tools/set-province-form";
import { setRegimentIconTool } from "./tools/set-regiment-icon";
import { setRegimentNavalTool } from "./tools/set-regiment-naval";
import { setRegimentUnitTool } from "./tools/set-regiment-unit";
import { setReligionCenterTool } from "./tools/set-religion-center";
import { setReligionColorTool } from "./tools/set-religion-color";
import { setReligionCultureTool } from "./tools/set-religion-culture";
import { setReligionDeityTool } from "./tools/set-religion-deity";
import { setReligionExpansionTool } from "./tools/set-religion-expansion";
import { setReligionFormTool } from "./tools/set-religion-form";
import { setReligionOriginsTool } from "./tools/set-religion-origins";
import { setReligionTypeTool } from "./tools/set-religion-type";
import { setRiverTypeTool } from "./tools/set-river-type";
import { setRiverWidthTool } from "./tools/set-river-width";
import { setRouteGroupTool } from "./tools/set-route-group";
import { setRouteLockTool } from "./tools/set-route-lock";
import { setStateCapitalTool } from "./tools/set-state-capital";
import { setStateCoaCustomTool } from "./tools/set-state-coa-custom";
import { setStateColorTool } from "./tools/set-state-color";
import { setStateCultureTool } from "./tools/set-state-culture";
import { setStateFormTool } from "./tools/set-state-form";
import { setStateLabelsModeTool } from "./tools/set-state-labels-mode";
import { setStateTypeTool } from "./tools/set-state-type";
import { setStylePresetTool } from "./tools/set-style-preset";
import { setWindTool } from "./tools/set-wind";
import { setWorldRatesTool } from "./tools/set-world-rates";
import { setYearAndEraTool } from "./tools/set-year-and-era";
import { setZoneColorTool } from "./tools/set-zone-color";
import { setZoneTypeTool } from "./tools/set-zone-type";
import { setZoneVisibilityTool } from "./tools/set-zone-visibility";
import { smoothHeightmapTool } from "./tools/smooth-heightmap";
import { splitRegimentTool } from "./tools/split-regiment";

export { AnthropicApiError, AnthropicClient } from "./anthropic-client";
export { clearApiKey, getApiKey, setApiKey } from "./api-key";
export { ChatController } from "./chat-controller";
export { mountChatWindow } from "./chat-window";
export { ToolRegistry } from "./tools";
export {
  addBiomeTool,
  createAddBiomeTool,
} from "./tools/add-biome";
export {
  addBurgTool,
  createAddBurgTool,
} from "./tools/add-burg";
export {
  addCultureTool,
  createAddCultureTool,
} from "./tools/add-culture";
export {
  addHillTool,
  createAddHillTool,
  DEFAULT_RANGE_X,
  DEFAULT_RANGE_Y,
} from "./tools/add-hill";
export {
  addMarkerTool,
  createAddMarkerTool,
} from "./tools/add-marker";
export {
  addPitTool,
  createAddPitTool,
} from "./tools/add-pit";
export {
  addProvinceTool,
  createAddProvinceTool,
} from "./tools/add-province";
export {
  addRangeTool,
  createAddRangeTool,
} from "./tools/add-range";
export {
  addRegimentTool,
  createAddRegimentTool,
} from "./tools/add-regiment";
export {
  addReligionTool,
  createAddReligionTool,
} from "./tools/add-religion";
export {
  addRouteTool,
  createAddRouteTool,
} from "./tools/add-route";
export {
  addRulerTool,
  createAddRulerTool,
  defaultRulerAddRuntime,
  RULER_CLASS_NAMES,
  type RulerAddRuntime,
} from "./tools/add-ruler";
export {
  addStateTool,
  createAddStateTool,
} from "./tools/add-state";
export {
  addStraitTool,
  createAddStraitTool,
} from "./tools/add-strait";
export {
  addTroughTool,
  createAddTroughTool,
} from "./tools/add-trough";
export {
  addZoneTool,
  createAddZoneTool,
} from "./tools/add-zone";
export {
  applyLayersPresetTool,
  createApplyLayersPresetTool,
} from "./tools/apply-layers-preset";
export {
  clearHeightmapTool,
  createClearHeightmapTool,
} from "./tools/clear-heightmap";
export {
  clearRulersTool,
  createClearRulersTool,
} from "./tools/clear-rulers";
export {
  createExportMapTool,
  EXPORT_FORMATS,
  exportMapTool,
  resolveExportFormat,
} from "./tools/export-map";
export {
  ADJACENT_ENTITY_TYPES,
  type AdjacentEntityRef,
  type AdjacentEntityType,
  createFindAdjacentEntitiesTool,
  DEFAULT_FIND_ADJACENT_ENTITIES_LIMIT,
  defaultFindAdjacentEntitiesRuntime,
  type FindAdjacentEntitiesHit,
  type FindAdjacentEntitiesResult,
  type FindAdjacentEntitiesRuntime,
  findAdjacentEntitiesInPack,
  findAdjacentEntitiesTool,
  MAX_FIND_ADJACENT_ENTITIES_LIMIT,
} from "./tools/find-adjacent-entities";
export {
  createFindBurgsByCultureTool,
  DEFAULT_FIND_BURGS_BY_CULTURE_LIMIT,
  defaultFindBurgsByCultureRuntime,
  type FindBurgsByCultureHit,
  type FindBurgsByCulturePayload,
  type FindBurgsByCultureResult,
  type FindBurgsByCultureRuntime,
  findBurgsByCultureInPack,
  findBurgsByCultureTool,
  MAX_FIND_BURGS_BY_CULTURE_LIMIT,
  type ResolveCultureResult,
  resolveCultureRefInPack,
} from "./tools/find-burgs-by-culture";
export {
  createFindBurgsByFeatureTool,
  DEFAULT_FIND_BURGS_BY_FEATURE_LIMIT,
  defaultFindBurgsByFeatureRuntime,
  type FindBurgsByFeatureHit,
  type FindBurgsByFeaturePayload,
  type FindBurgsByFeatureResult,
  type FindBurgsByFeatureRuntime,
  findBurgsByFeatureInPack,
  findBurgsByFeatureTool,
  MAX_FIND_BURGS_BY_FEATURE_LIMIT,
  type ResolveFeatureResult,
  resolveFeatureRefInPack,
} from "./tools/find-burgs-by-feature";
export {
  createFindBurgsByPopulationRangeTool,
  DEFAULT_FIND_BURGS_BY_POPULATION_RANGE_LIMIT,
  defaultFindBurgsByPopulationRangeRuntime,
  type FindBurgsByPopulationRangeHit,
  type FindBurgsByPopulationRangePayload,
  type FindBurgsByPopulationRangeResult,
  type FindBurgsByPopulationRangeRuntime,
  findBurgsByPopulationRangeInPack,
  findBurgsByPopulationRangeTool,
  MAX_FIND_BURGS_BY_POPULATION_RANGE_LIMIT,
} from "./tools/find-burgs-by-population-range";
export {
  createFindBurgsByReligionTool,
  DEFAULT_FIND_BURGS_BY_RELIGION_LIMIT,
  defaultFindBurgsByReligionRuntime,
  type FindBurgsByReligionHit,
  type FindBurgsByReligionPayload,
  type FindBurgsByReligionResult,
  type FindBurgsByReligionRuntime,
  findBurgsByReligionInPack,
  findBurgsByReligionTool,
  MAX_FIND_BURGS_BY_RELIGION_LIMIT,
  type ResolveReligionResult,
  resolveReligionRefInPack,
} from "./tools/find-burgs-by-religion";
export {
  createFindBurgsByStateTool,
  DEFAULT_FIND_BURGS_BY_STATE_LIMIT,
  defaultFindBurgsByStateRuntime,
  type FindBurgsByStateHit,
  type FindBurgsByStatePayload,
  type FindBurgsByStateResult,
  type FindBurgsByStateRuntime,
  findBurgsByStateInPack,
  findBurgsByStateTool,
  MAX_FIND_BURGS_BY_STATE_LIMIT,
} from "./tools/find-burgs-by-state";
export {
  createFindBurgsByTypeTool,
  DEFAULT_FIND_BURGS_BY_TYPE_LIMIT,
  defaultFindBurgsByTypeRuntime,
  type FindBurgsByTypeHit,
  type FindBurgsByTypePayload,
  type FindBurgsByTypeResult,
  type FindBurgsByTypeRuntime,
  findBurgsByTypeInPack,
  findBurgsByTypeTool,
  MAX_FIND_BURGS_BY_TYPE_LIMIT,
} from "./tools/find-burgs-by-type";
export {
  createFindBurgsInAreaTool,
  DEFAULT_FIND_BURGS_IN_AREA_LIMIT,
  defaultFindBurgsInAreaRuntime,
  type FindBurgsInAreaArea,
  type FindBurgsInAreaHit,
  type FindBurgsInAreaPayload,
  type FindBurgsInAreaQuery,
  type FindBurgsInAreaResult,
  type FindBurgsInAreaRuntime,
  findBurgsInAreaInPack,
  findBurgsInAreaTool,
  MAX_FIND_BURGS_IN_AREA_LIMIT,
} from "./tools/find-burgs-in-area";
export {
  createFindCellAtCoordsTool,
  defaultFindCellRuntime,
  type FindCellRuntime,
  findCellAtCoordsTool,
  scanPackForNearestCell,
} from "./tools/find-cell-at-coords";
export {
  type AdjacentEntityCellsHit,
  type CollectAdjacentCellsResult,
  collectAdjacentCellsForEntity,
  createFindCellsAdjacentToEntityTool,
  DEFAULT_FIND_CELLS_ADJACENT_TO_ENTITY_LIMIT,
  defaultFindCellsAdjacentToEntityRuntime,
  type FindCellsAdjacentToEntityRuntime,
  findCellsAdjacentToEntityTool,
  MAX_FIND_CELLS_ADJACENT_TO_ENTITY_LIMIT,
} from "./tools/find-cells-adjacent-to-entity";
export {
  createFindCellsByBiomeTool,
  DEFAULT_FIND_CELLS_BY_BIOME_LIMIT,
  defaultFindCellsByBiomeRuntime,
  type FindCellsByBiomeHit,
  type FindCellsByBiomeResult,
  type FindCellsByBiomeRuntime,
  findBiomeCellsInPack,
  findCellsByBiomeTool,
  MAX_FIND_CELLS_BY_BIOME_LIMIT,
} from "./tools/find-cells-by-biome";
export {
  createFindCellsByFeatureTool,
  DEFAULT_FIND_CELLS_BY_FEATURE_LIMIT,
  defaultFindCellsByFeatureRuntime,
  type FindCellsByFeatureHit,
  type FindCellsByFeaturePackLike,
  type FindCellsByFeatureResult,
  type FindCellsByFeatureRuntime,
  findCellsByFeatureTool,
  findFeatureCellsInPack,
  MAX_FIND_CELLS_BY_FEATURE_LIMIT,
} from "./tools/find-cells-by-feature";
export {
  createFindCellsByHeightRangeTool,
  DEFAULT_FIND_CELLS_BY_HEIGHT_RANGE_LIMIT,
  defaultFindCellsByHeightRangeRuntime,
  type FindCellsByHeightRangeHit,
  type FindCellsByHeightRangeResult,
  type FindCellsByHeightRangeRuntime,
  findCellsByHeightRangeInPack,
  findCellsByHeightRangeTool,
  MAX_FIND_CELLS_BY_HEIGHT_RANGE_LIMIT,
  MAX_HEIGHT,
  MIN_HEIGHT,
} from "./tools/find-cells-by-height-range";
export {
  createFindCellsByPopulationRangeTool,
  DEFAULT_FIND_CELLS_BY_POPULATION_RANGE_LIMIT,
  defaultFindCellsByPopulationRangeRuntime,
  type FindCellsByPopulationRangeHit,
  type FindCellsByPopulationRangeResult,
  type FindCellsByPopulationRangeRuntime,
  findCellsByPopulationRangeInPack,
  findCellsByPopulationRangeTool,
  MAX_FIND_CELLS_BY_POPULATION_RANGE_LIMIT,
  MIN_POPULATION,
} from "./tools/find-cells-by-population-range";
export {
  createFindCellsByPrecipitationRangeTool,
  DEFAULT_FIND_CELLS_BY_PRECIPITATION_RANGE_LIMIT,
  defaultFindCellsByPrecipitationRangeRuntime,
  type FindCellsByPrecipitationRangeHit,
  type FindCellsByPrecipitationRangeResult,
  type FindCellsByPrecipitationRangeRuntime,
  findCellsByPrecipitationRangeInPack,
  findCellsByPrecipitationRangeTool,
  MAX_FIND_CELLS_BY_PRECIPITATION_RANGE_LIMIT,
  MAX_PRECIPITATION,
  MIN_PRECIPITATION,
} from "./tools/find-cells-by-precipitation-range";
export {
  createFindCellsByTemperatureRangeTool,
  DEFAULT_FIND_CELLS_BY_TEMPERATURE_RANGE_LIMIT,
  defaultFindCellsByTemperatureRangeRuntime,
  type FindCellsByTemperatureRangeHit,
  type FindCellsByTemperatureRangeResult,
  type FindCellsByTemperatureRangeRuntime,
  findCellsByTemperatureRangeInPack,
  findCellsByTemperatureRangeTool,
  MAX_FIND_CELLS_BY_TEMPERATURE_RANGE_LIMIT,
  MAX_TEMPERATURE,
  MIN_TEMPERATURE,
} from "./tools/find-cells-by-temperature-range";
export {
  createFindCellsInRadiusTool,
  DEFAULT_FIND_CELLS_IN_RADIUS_LIMIT,
  defaultFindCellsInRadiusRuntime,
  type FindCellsInRadiusHit,
  type FindCellsInRadiusQuery,
  type FindCellsInRadiusResult,
  type FindCellsInRadiusRuntime,
  findCellsInRadiusInPack,
  findCellsInRadiusTool,
  MAX_FIND_CELLS_IN_RADIUS_LIMIT,
} from "./tools/find-cells-in-radius";
export {
  createFindCoastCellsTool,
  DEFAULT_FIND_COAST_CELLS_LIMIT,
  defaultFindCoastCellsRuntime,
  type FindCoastCellsHit,
  type FindCoastCellsResult,
  type FindCoastCellsRuntime,
  type FindCoastSide,
  findCoastCellsInPack,
  findCoastCellsTool,
  MAX_FIND_COAST_CELLS_LIMIT,
} from "./tools/find-coast-cells";
export {
  createFindCulturesByTypeTool,
  DEFAULT_FIND_CULTURES_BY_TYPE_LIMIT,
  defaultFindCulturesByTypeRuntime,
  type FindCulturesByTypeHit,
  type FindCulturesByTypePayload,
  type FindCulturesByTypeResult,
  type FindCulturesByTypeRuntime,
  findCulturesByTypeInPack,
  findCulturesByTypeTool,
  MAX_FIND_CULTURES_BY_TYPE_LIMIT,
} from "./tools/find-cultures-by-type";
export {
  createFindCulturesInAreaTool,
  DEFAULT_FIND_CULTURES_IN_AREA_LIMIT,
  defaultFindCulturesInAreaRuntime,
  type FindCulturesInAreaArea,
  type FindCulturesInAreaHit,
  type FindCulturesInAreaPayload,
  type FindCulturesInAreaQuery,
  type FindCulturesInAreaResult,
  type FindCulturesInAreaRuntime,
  findCulturesInAreaInPack,
  findCulturesInAreaTool,
  MAX_FIND_CULTURES_IN_AREA_LIMIT,
} from "./tools/find-cultures-in-area";
export {
  createFindHighestPeaksTool,
  DEFAULT_FIND_HIGHEST_PEAKS_N,
  defaultFindHighestPeaksRuntime,
  type FindHighestPeaksHit,
  type FindHighestPeaksPayload,
  type FindHighestPeaksResult,
  type FindHighestPeaksRuntime,
  findHighestPeaksInPack,
  findHighestPeaksTool,
  LAND_HEIGHT_MIN,
  MAX_FIND_HIGHEST_PEAKS_N,
} from "./tools/find-highest-peaks";
export {
  createFindLargestBurgsTool,
  DEFAULT_FIND_LARGEST_BURGS_N,
  defaultFindLargestBurgsRuntime,
  type FindLargestBurgsHit,
  type FindLargestBurgsPayload,
  type FindLargestBurgsResult,
  type FindLargestBurgsRuntime,
  findLargestBurgsInPack,
  findLargestBurgsTool,
  MAX_FIND_LARGEST_BURGS_N,
} from "./tools/find-largest-burgs";
export {
  createFindLargestCulturesTool,
  DEFAULT_FIND_LARGEST_CULTURES_BY,
  DEFAULT_FIND_LARGEST_CULTURES_N,
  defaultFindLargestCulturesRuntime,
  FIND_LARGEST_CULTURES_METRICS,
  type FindLargestCulturesHit,
  type FindLargestCulturesMetric,
  type FindLargestCulturesPayload,
  type FindLargestCulturesResult,
  type FindLargestCulturesRuntime,
  findLargestCulturesInPack,
  findLargestCulturesTool,
  MAX_FIND_LARGEST_CULTURES_N,
} from "./tools/find-largest-cultures";
export {
  createFindLargestFeaturesTool,
  DEFAULT_FIND_LARGEST_FEATURES_BY,
  DEFAULT_FIND_LARGEST_FEATURES_N,
  defaultFindLargestFeaturesRuntime,
  FIND_LARGEST_FEATURES_METRICS,
  FIND_LARGEST_FEATURES_TYPE_FILTERS,
  type FindLargestFeaturesHit,
  type FindLargestFeaturesMetric,
  type FindLargestFeaturesPayload,
  type FindLargestFeaturesResult,
  type FindLargestFeaturesRuntime,
  type FindLargestFeaturesTypeFilter,
  findLargestFeaturesInPack,
  findLargestFeaturesTool,
  MAX_FIND_LARGEST_FEATURES_N,
} from "./tools/find-largest-features";
export {
  createFindLargestProvincesTool,
  DEFAULT_FIND_LARGEST_PROVINCES_BY,
  DEFAULT_FIND_LARGEST_PROVINCES_N,
  defaultFindLargestProvincesRuntime,
  FIND_LARGEST_PROVINCES_METRICS,
  type FindLargestProvincesHit,
  type FindLargestProvincesMetric,
  type FindLargestProvincesPayload,
  type FindLargestProvincesResult,
  type FindLargestProvincesRuntime,
  findLargestProvincesInPack,
  findLargestProvincesTool,
  MAX_FIND_LARGEST_PROVINCES_N,
} from "./tools/find-largest-provinces";
export {
  createFindLargestReligionsTool,
  DEFAULT_FIND_LARGEST_RELIGIONS_BY,
  DEFAULT_FIND_LARGEST_RELIGIONS_N,
  defaultFindLargestReligionsRuntime,
  FIND_LARGEST_RELIGIONS_METRICS,
  type FindLargestReligionsHit,
  type FindLargestReligionsMetric,
  type FindLargestReligionsPayload,
  type FindLargestReligionsResult,
  type FindLargestReligionsRuntime,
  findLargestReligionsInPack,
  findLargestReligionsTool,
  MAX_FIND_LARGEST_RELIGIONS_N,
} from "./tools/find-largest-religions";
export {
  createFindLargestStatesTool,
  DEFAULT_FIND_LARGEST_STATES_BY,
  DEFAULT_FIND_LARGEST_STATES_N,
  defaultFindLargestStatesRuntime,
  FIND_LARGEST_STATES_METRICS,
  type FindLargestStatesHit,
  type FindLargestStatesMetric,
  type FindLargestStatesPayload,
  type FindLargestStatesResult,
  type FindLargestStatesRuntime,
  findLargestStatesInPack,
  findLargestStatesTool,
  MAX_FIND_LARGEST_STATES_N,
} from "./tools/find-largest-states";
export {
  createFindLongestRiversTool,
  DEFAULT_FIND_LONGEST_RIVERS_N,
  defaultFindLongestRiversRuntime,
  type FindLongestRiversHit,
  type FindLongestRiversPayload,
  type FindLongestRiversResult,
  type FindLongestRiversRuntime,
  findLongestRiversInPack,
  findLongestRiversTool,
  MAX_FIND_LONGEST_RIVERS_N,
} from "./tools/find-longest-rivers";
export {
  createFindMarkersByStateTool,
  DEFAULT_FIND_MARKERS_BY_STATE_LIMIT,
  defaultFindMarkersByStateRuntime,
  type FindMarkersByStateHit,
  type FindMarkersByStatePayload,
  type FindMarkersByStateResult,
  type FindMarkersByStateRuntime,
  findMarkersByStateInPack,
  findMarkersByStateTool,
  MAX_FIND_MARKERS_BY_STATE_LIMIT,
} from "./tools/find-markers-by-state";
export {
  createFindMarkersByTypeTool,
  DEFAULT_FIND_MARKERS_BY_TYPE_LIMIT,
  defaultFindMarkersByTypeRuntime,
  type FindMarkersByTypeHit,
  type FindMarkersByTypePayload,
  type FindMarkersByTypeQuery,
  type FindMarkersByTypeResult,
  type FindMarkersByTypeRuntime,
  findMarkersByTypeInPack,
  findMarkersByTypeTool,
  MAX_FIND_MARKERS_BY_TYPE_LIMIT,
} from "./tools/find-markers-by-type";
export {
  createFindMarkersInAreaTool,
  DEFAULT_FIND_MARKERS_IN_AREA_LIMIT,
  defaultFindMarkersInAreaRuntime,
  type FindMarkersInAreaArea,
  type FindMarkersInAreaHit,
  type FindMarkersInAreaPayload,
  type FindMarkersInAreaQuery,
  type FindMarkersInAreaResult,
  type FindMarkersInAreaRuntime,
  findMarkersInAreaInPack,
  findMarkersInAreaTool,
  MAX_FIND_MARKERS_IN_AREA_LIMIT,
} from "./tools/find-markers-in-area";
export {
  createFindNearestBurgTool,
  defaultFindNearestBurgRuntime,
  type FindNearestBurgHit,
  type FindNearestBurgQuery,
  type FindNearestBurgResult,
  type FindNearestBurgRuntime,
  findNearestBurgInPack,
  findNearestBurgTool,
} from "./tools/find-nearest-burg";
export {
  createFindNearestMarkerTool,
  defaultFindNearestMarkerRuntime,
  type FindNearestMarkerHit,
  type FindNearestMarkerOutcome,
  type FindNearestMarkerQuery,
  type FindNearestMarkerResult,
  type FindNearestMarkerRuntime,
  findNearestMarkerInPack,
  findNearestMarkerTool,
} from "./tools/find-nearest-marker";
export {
  createFindNearestRiverTool,
  defaultFindNearestRiverRuntime,
  type FindNearestRiverHit,
  type FindNearestRiverOutcome,
  type FindNearestRiverQuery,
  type FindNearestRiverResult,
  type FindNearestRiverRuntime,
  findNearestRiverInPack,
  findNearestRiverTool,
} from "./tools/find-nearest-river";
export {
  createFindNotesByPrefixTool,
  DEFAULT_FIND_NOTES_BY_PREFIX_LIMIT,
  defaultFindNotesByPrefixRuntime,
  type FindNotesByPrefixPayload,
  type FindNotesByPrefixRuntime,
  findNotesByPrefixInNotes,
  findNotesByPrefixTool,
  MAX_FIND_NOTES_BY_PREFIX_LIMIT,
  NOTE_LEGEND_PREVIEW_MAX,
  type NoteMatch,
} from "./tools/find-notes-by-prefix";
export {
  createFindOrphanCellsTool,
  DEFAULT_FIND_ORPHAN_CELLS_LIMIT,
  defaultFindOrphanCellsRuntime,
  type FindOrphanCellsHit,
  type FindOrphanCellsResult,
  type FindOrphanCellsRuntime,
  findOrphanCellsInPack,
  findOrphanCellsTool,
  MAX_FIND_ORPHAN_CELLS_LIMIT,
} from "./tools/find-orphan-cells";
export {
  createFindProvincesByStateTool,
  DEFAULT_FIND_PROVINCES_BY_STATE_LIMIT,
  defaultFindProvincesByStateRuntime,
  type FindProvincesByStateHit,
  type FindProvincesByStatePayload,
  type FindProvincesByStateResult,
  type FindProvincesByStateRuntime,
  findProvincesByStateInPack,
  findProvincesByStateTool,
  MAX_FIND_PROVINCES_BY_STATE_LIMIT,
} from "./tools/find-provinces-by-state";
export {
  createFindProvincesInAreaTool,
  DEFAULT_FIND_PROVINCES_IN_AREA_LIMIT,
  defaultFindProvincesInAreaRuntime,
  type FindProvincesInAreaArea,
  type FindProvincesInAreaHit,
  type FindProvincesInAreaPayload,
  type FindProvincesInAreaQuery,
  type FindProvincesInAreaResult,
  type FindProvincesInAreaRuntime,
  findProvincesInAreaInPack,
  findProvincesInAreaTool,
  MAX_FIND_PROVINCES_IN_AREA_LIMIT,
} from "./tools/find-provinces-in-area";
export {
  createFindRegimentsByStateTool,
  DEFAULT_FIND_REGIMENTS_BY_STATE_LIMIT,
  defaultFindRegimentsByStateRuntime,
  type FindRegimentsByStateHit,
  type FindRegimentsByStatePayload,
  type FindRegimentsByStateResult,
  type FindRegimentsByStateRuntime,
  findRegimentsByStateInPack,
  findRegimentsByStateTool,
  MAX_FIND_REGIMENTS_BY_STATE_LIMIT,
} from "./tools/find-regiments-by-state";
export {
  createFindRegimentsByTypeTool,
  DEFAULT_FIND_REGIMENTS_BY_TYPE_LIMIT,
  defaultFindRegimentsByTypeRuntime,
  type FindRegimentsByTypeHit,
  type FindRegimentsByTypePayload,
  type FindRegimentsByTypeResult,
  type FindRegimentsByTypeRuntime,
  type FindRegimentsByTypeStateRef,
  findRegimentsByTypeInPack,
  findRegimentsByTypeTool,
  MAX_FIND_REGIMENTS_BY_TYPE_LIMIT,
} from "./tools/find-regiments-by-type";
export {
  createFindReligionsByCultureTool,
  DEFAULT_FIND_RELIGIONS_BY_CULTURE_LIMIT,
  defaultFindReligionsByCultureRuntime,
  type FindReligionsByCultureHit,
  type FindReligionsByCulturePayload,
  type FindReligionsByCultureResult,
  type FindReligionsByCultureRuntime,
  findReligionsByCultureInPack,
  findReligionsByCultureTool,
  MAX_FIND_RELIGIONS_BY_CULTURE_LIMIT,
} from "./tools/find-religions-by-culture";
export {
  createFindReligionsByTypeTool,
  DEFAULT_FIND_RELIGIONS_BY_TYPE_LIMIT,
  defaultFindReligionsByTypeRuntime,
  type FindReligionsByTypeHit,
  type FindReligionsByTypePayload,
  type FindReligionsByTypeResult,
  type FindReligionsByTypeRuntime,
  findReligionsByTypeInPack,
  findReligionsByTypeTool,
  MAX_FIND_RELIGIONS_BY_TYPE_LIMIT,
} from "./tools/find-religions-by-type";
export {
  createFindReligionsInAreaTool,
  DEFAULT_FIND_RELIGIONS_IN_AREA_LIMIT,
  defaultFindReligionsInAreaRuntime,
  type FindReligionsInAreaArea,
  type FindReligionsInAreaHit,
  type FindReligionsInAreaPayload,
  type FindReligionsInAreaQuery,
  type FindReligionsInAreaResult,
  type FindReligionsInAreaRuntime,
  findReligionsInAreaInPack,
  findReligionsInAreaTool,
  MAX_FIND_RELIGIONS_IN_AREA_LIMIT,
} from "./tools/find-religions-in-area";
export {
  createFindRiversByBasinTool,
  DEFAULT_FIND_RIVERS_BY_BASIN_LIMIT,
  defaultFindRiversByBasinRuntime,
  type FindRiversByBasinBasinRef,
  type FindRiversByBasinHit,
  type FindRiversByBasinPayload,
  type FindRiversByBasinResult,
  type FindRiversByBasinRuntime,
  findRiversByBasinInPack,
  findRiversByBasinTool,
  MAX_FIND_RIVERS_BY_BASIN_LIMIT,
  type ResolveBasinResult,
  resolveBasinRefInPack,
} from "./tools/find-rivers-by-basin";
export {
  createFindRiversByStateTool,
  DEFAULT_FIND_RIVERS_BY_STATE_LIMIT,
  defaultFindRiversByStateRuntime,
  type FindRiversByStateHit,
  type FindRiversByStatePayload,
  type FindRiversByStateResult,
  type FindRiversByStateRuntime,
  findRiversByStateInPack,
  findRiversByStateTool,
  MAX_FIND_RIVERS_BY_STATE_LIMIT,
} from "./tools/find-rivers-by-state";
export {
  createFindRiversInAreaTool,
  DEFAULT_FIND_RIVERS_IN_AREA_LIMIT,
  defaultFindRiversInAreaRuntime,
  type FindRiversInAreaArea,
  type FindRiversInAreaHit,
  type FindRiversInAreaPayload,
  type FindRiversInAreaQuery,
  type FindRiversInAreaResult,
  type FindRiversInAreaRuntime,
  findRiversInAreaInPack,
  findRiversInAreaTool,
  MAX_FIND_RIVERS_IN_AREA_LIMIT,
} from "./tools/find-rivers-in-area";
export {
  createFindRoutesByGroupTool,
  DEFAULT_FIND_ROUTES_BY_GROUP_LIMIT,
  defaultFindRoutesByGroupRuntime,
  type FindRoutesByGroupHit,
  type FindRoutesByGroupPayload,
  type FindRoutesByGroupQuery,
  type FindRoutesByGroupResult,
  type FindRoutesByGroupRuntime,
  findRoutesByGroupInPack,
  findRoutesByGroupTool,
  MAX_FIND_ROUTES_BY_GROUP_LIMIT,
} from "./tools/find-routes-by-group";
export {
  createFindStatesByCultureTool,
  DEFAULT_FIND_STATES_BY_CULTURE_LIMIT,
  defaultFindStatesByCultureRuntime,
  type FindStatesByCultureHit,
  type FindStatesByCulturePayload,
  type FindStatesByCultureResult,
  type FindStatesByCultureRuntime,
  findStatesByCultureInPack,
  findStatesByCultureTool,
  MAX_FIND_STATES_BY_CULTURE_LIMIT,
} from "./tools/find-states-by-culture";
export {
  createFindStatesByTypeTool,
  DEFAULT_FIND_STATES_BY_TYPE_LIMIT,
  defaultFindStatesByTypeRuntime,
  type FindStatesByTypeHit,
  type FindStatesByTypePayload,
  type FindStatesByTypeResult,
  type FindStatesByTypeRuntime,
  findStatesByTypeInPack,
  findStatesByTypeTool,
  MAX_FIND_STATES_BY_TYPE_LIMIT,
} from "./tools/find-states-by-type";
export {
  createFindStatesInAreaTool,
  DEFAULT_FIND_STATES_IN_AREA_LIMIT,
  defaultFindStatesInAreaRuntime,
  type FindStatesInAreaArea,
  type FindStatesInAreaHit,
  type FindStatesInAreaPayload,
  type FindStatesInAreaQuery,
  type FindStatesInAreaResult,
  type FindStatesInAreaRuntime,
  findStatesInAreaInPack,
  findStatesInAreaTool,
  MAX_FIND_STATES_IN_AREA_LIMIT,
} from "./tools/find-states-in-area";
export {
  createFindZonesByTypeTool,
  DEFAULT_FIND_ZONES_BY_TYPE_LIMIT,
  defaultFindZonesByTypeRuntime,
  type FindZonesByTypeHit,
  type FindZonesByTypePayload,
  type FindZonesByTypeQuery,
  type FindZonesByTypeResult,
  type FindZonesByTypeRuntime,
  findZonesByTypeInPack,
  findZonesByTypeTool,
  MAX_FIND_ZONES_BY_TYPE_LIMIT,
} from "./tools/find-zones-by-type";
export {
  createFocusOnMapTool,
  focusOnMapTool,
} from "./tools/focus-on-map";
export {
  type BiomeDistributionBiomesData,
  type BiomeDistributionEntry,
  type BiomeDistributionPackLike,
  type BiomeDistributionPayload,
  type BiomeDistributionResult,
  type BiomeDistributionRuntime,
  createGetBiomeDistributionTool,
  defaultBiomeDistributionRuntime,
  getBiomeDistributionTool,
  readBiomeDistributionFromPack,
} from "./tools/get-biome-distribution";
export {
  type BiomeInfo,
  type BiomeInfoRuntime,
  createGetBiomeInfoTool,
  defaultBiomeInfoRuntime,
  getBiomeInfoTool,
  readBiomeInfoFromPack,
} from "./tools/get-biome-info";
export {
  type BurgDistribution,
  type BurgDistributionEntry,
  type BurgDistributionPackLike,
  type BurgDistributionRates,
  type BurgDistributionRuntime,
  createGetBurgDistributionTool,
  defaultBurgDistributionRuntime,
  getBurgDistributionTool,
  readBurgDistributionFromPack,
} from "./tools/get-burg-distribution";
export {
  type BurgCoaInfo,
  type BurgFeatureFlags,
  type BurgInfo,
  type BurgInfoRuntime,
  createGetBurgInfoTool,
  defaultBurgInfoRuntime,
  getBurgInfoTool,
  readBurgInfoFromPack,
} from "./tools/get-burg-info";
export {
  type CellInfo,
  type CellInfoRuntime,
  createGetCellInfoTool,
  defaultCellInfoRuntime,
  getCellInfoTool,
  readCellFromState,
} from "./tools/get-cell-info";
export {
  type ClimateStat,
  type ClimateStats,
  type ClimateStatsGridLike,
  type ClimateStatsRuntime,
  createGetClimateStatsTool,
  defaultClimateStatsRuntime,
  getClimateStatsTool,
  readClimateStatsFromGrid,
} from "./tools/get-climate-stats";
export {
  type CultureDistribution,
  type CultureDistributionEntry,
  type CultureDistributionPackLike,
  type CultureDistributionRuntime,
  createGetCultureDistributionTool,
  defaultCultureDistributionRuntime,
  getCultureDistributionTool,
  readCultureDistributionFromPack,
} from "./tools/get-culture-distribution";
export {
  type CultureInfo,
  type CultureInfoRuntime,
  createGetCultureInfoTool,
  defaultCultureInfoRuntime,
  getCultureInfoTool,
  readCultureInfoFromPack,
} from "./tools/get-culture-info";
export {
  createGetDiplomacyBetweenTool,
  type DiplomacyBetween,
  type DiplomacyBetweenRuntime,
  defaultDiplomacyBetweenRuntime,
  getDiplomacyBetweenTool,
  readDiplomacyBetweenFromPack,
} from "./tools/get-diplomacy-between";
export {
  type Bbox,
  type CollectEntityBboxResult,
  collectEntityBbox,
  createGetEntityBboxTool,
  defaultGetEntityBboxRuntime,
  type EntityBboxHit,
  type GetEntityBboxRuntime,
  getEntityBboxTool,
} from "./tools/get-entity-bbox";
export {
  type CollectEntityCellsResult,
  collectCellsForEntity,
  createGetEntityCellsTool,
  DEFAULT_GET_ENTITY_CELLS_LIMIT,
  defaultGetEntityCellsRuntime,
  ENTITY_TYPES,
  type EntityCellsHit,
  type EntityType,
  type GetEntityCellsRuntime,
  getEntityCellsTool,
  MAX_GET_ENTITY_CELLS_LIMIT,
} from "./tools/get-entity-cells";
export {
  type CollectEntityCentroidResult,
  computeEntityCentroid,
  createGetEntityCentroidTool,
  defaultGetEntityCentroidRuntime,
  type EntityCentroid,
  type EntityCentroidHit,
  type GetEntityCentroidRuntime,
  getEntityCentroidTool,
} from "./tools/get-entity-centroid";
export {
  createGetFeatureDistributionTool,
  defaultFeatureDistributionRuntime,
  type FeatureDistribution,
  type FeatureDistributionEntry,
  type FeatureDistributionPackLike,
  type FeatureDistributionRuntime,
  getFeatureDistributionTool,
  readFeatureDistributionFromPack,
} from "./tools/get-feature-distribution";
export {
  createGetFeatureInfoTool,
  defaultFeatureInfoRuntime,
  type FeatureInfo,
  type FeatureInfoRuntime,
  getFeatureInfoTool,
  readFeatureInfoFromPack,
} from "./tools/get-feature-info";
export {
  createGetLayerStyleTool,
  defaultLayerStyleRuntime,
  getLayerStyleTool,
  type LayerStyleAttrs,
  type LayerStyleRuntime,
} from "./tools/get-layer-style";
export {
  createGetMapInfoTool,
  getMapInfoTool,
} from "./tools/get-map-info";
export {
  createGetMarkerInfoTool,
  defaultMarkerInfoRuntime,
  getMarkerInfoTool,
  MARKER_LEGEND_MAX_CHARS,
  type MarkerInfo,
  type MarkerInfoRuntime,
  readMarkerInfoFromPack,
} from "./tools/get-marker-info";
export {
  createGetNoteInfoTool,
  defaultNoteInfoRuntime,
  getNoteInfoTool,
  type NoteInfo,
  type NoteInfoRuntime,
  type ReadNoteInfoResult,
} from "./tools/get-note-info";
export {
  createGetPopulationStatsTool,
  DEFAULT_TOP_N,
  defaultPopulationStatsRuntime,
  getPopulationStatsTool,
  MAX_TOP_N,
  type PopulationStats,
  type PopulationStatsRuntime,
  readPopulationStatsFromPack,
} from "./tools/get-population-stats";
export {
  createGetProvinceDistributionTool,
  defaultProvinceDistributionRuntime,
  getProvinceDistributionTool,
  type ProvinceDistribution,
  type ProvinceDistributionEntry,
  type ProvinceDistributionPackLike,
  type ProvinceDistributionRuntime,
  readProvinceDistributionFromPack,
} from "./tools/get-province-distribution";
export {
  createGetProvinceInfoTool,
  defaultProvinceInfoRuntime,
  getProvinceInfoTool,
  type ProvinceInfo,
  type ProvinceInfoRuntime,
  readProvinceInfoFromPack,
} from "./tools/get-province-info";
export {
  createGetRegimentInfoTool,
  defaultRegimentInfoRuntime,
  getRegimentInfoTool,
  type RegimentInfo,
  type RegimentInfoRuntime,
  readRegimentInfoFromPack,
} from "./tools/get-regiment-info";
export {
  createGetReligionDistributionTool,
  defaultReligionDistributionRuntime,
  getReligionDistributionTool,
  type ReligionDistribution,
  type ReligionDistributionEntry,
  type ReligionDistributionPackLike,
  type ReligionDistributionRuntime,
  readReligionDistributionFromPack,
} from "./tools/get-religion-distribution";
export {
  createGetReligionInfoTool,
  defaultReligionInfoRuntime,
  getReligionInfoTool,
  type ReligionInfo,
  type ReligionInfoRuntime,
  readReligionInfoFromPack,
} from "./tools/get-religion-info";
export {
  createGetRiverDistributionTool,
  defaultRiverDistributionRuntime,
  getRiverDistributionTool,
  type RiverDistribution,
  type RiverDistributionEntry,
  type RiverDistributionPackLike,
  type RiverDistributionRuntime,
  readRiverDistributionFromPack,
} from "./tools/get-river-distribution";
export {
  createGetRiverInfoTool,
  defaultRiverInfoRuntime,
  getRiverInfoTool,
  type RiverInfo,
  type RiverInfoRuntime,
  readRiverInfoFromPack,
} from "./tools/get-river-info";
export {
  createGetRouteInfoTool,
  DEFAULT_POINTS_LIMIT,
  defaultRouteInfoRuntime,
  getRouteInfoTool,
  MAX_POINTS_LIMIT,
  type RouteInfo,
  type RouteInfoPackLike,
  type RouteInfoRuntime,
  readRouteInfoFromPack,
} from "./tools/get-route-info";
export {
  createGetStateDistributionTool,
  defaultStateDistributionRuntime,
  getStateDistributionTool,
  readStateDistributionFromPack,
  type StateDistribution,
  type StateDistributionEntry,
  type StateDistributionPackLike,
  type StateDistributionRuntime,
} from "./tools/get-state-distribution";
export {
  createGetStateInfoTool,
  defaultStateInfoRuntime,
  getStateInfoTool,
  readStateInfoFromPack,
  type StateInfo,
  type StateInfoRuntime,
} from "./tools/get-state-info";
export {
  createGetTerrainStatsTool,
  defaultTerrainStatsRuntime,
  getTerrainStatsTool,
  readTerrainStatsFromPack,
  TERRAIN_BAND_RANGES,
  type TerrainBandName,
  type TerrainBands,
  type TerrainStats,
  type TerrainStatsRuntime,
} from "./tools/get-terrain-stats";
export {
  createGetZoneDistributionTool,
  defaultZoneDistributionRuntime,
  getZoneDistributionTool,
  readZoneDistributionFromPack,
  UNTYPED_ZONE_BUCKET,
  type ZoneDistribution,
  type ZoneDistributionEntry,
  type ZoneDistributionPackLike,
  type ZoneDistributionRuntime,
} from "./tools/get-zone-distribution";
export {
  createGetZoneInfoTool,
  DEFAULT_ZONE_CELLS_LIMIT,
  getZoneInfoTool,
  MAX_ZONE_CELLS_LIMIT,
} from "./tools/get-zone-info";
export {
  createInvertHeightmapTool,
  invertHeightmapTool,
} from "./tools/invert-heightmap";
export {
  createListBiomesTool,
  listBiomesTool,
  readBiomesFromPack,
} from "./tools/list-biomes";
export {
  createListBurgsTool,
  listBurgsTool,
} from "./tools/list-burgs";
export {
  createListCulturesTool,
  listCulturesTool,
} from "./tools/list-cultures";
export {
  type CulturesSetEntry,
  createListCulturesSetsTool,
  cultureSetDisplayName,
  listCulturesSetsEntries,
  listCulturesSetsTool,
} from "./tools/list-cultures-sets";
export {
  createListDiplomacyTool,
  listDiplomacyTool,
  readDiplomacyFromPack,
} from "./tools/list-diplomacy";
export {
  createListEmblemShapesTool,
  defaultEmblemShapesListRuntime,
  type EmblemShapeEntry,
  type EmblemShapesListRuntime,
  listEmblemShapesTool,
} from "./tools/list-emblem-shapes";
export {
  createListFeaturesTool,
  defaultFeaturesRuntime,
  type FeaturePackLike,
  type FeatureSummary,
  type FeaturesRuntime,
  listFeaturesTool,
  readFeaturesFromPack,
} from "./tools/list-features";
export {
  createListHeightmapTemplatesTool,
  defaultHeightmapListRuntime,
  type HeightmapListEntry,
  type HeightmapListRuntime,
  listHeightmapTemplatesTool,
  readHeightmapListFromGlobals,
} from "./tools/list-heightmap-templates";
export {
  createListMarkerPinsTool,
  defaultMarkerPinListRuntime,
  listMarkerPinsTool,
  type MarkerPinEntry,
  type MarkerPinListRuntime,
} from "./tools/list-marker-pins";
export {
  createListMarkerTypesTool,
  defaultMarkerTypesRuntime,
  listMarkerTypesTool,
  type MarkerTypeCount,
  type MarkerTypesPackLike,
  type MarkerTypesRuntime,
  type MarkerTypesSummary,
  readMarkerTypesFromPack,
  UNTYPED_MARKER_BUCKET,
} from "./tools/list-marker-types";
export {
  createListMarkersTool,
  listMarkersTool,
  readMarkersFromPack,
} from "./tools/list-markers";
export {
  classifyNoteId,
  createListNotesTool,
  listNotesTool,
  stripHtml,
} from "./tools/list-notes";
export {
  createListProvincesTool,
  listProvincesTool,
} from "./tools/list-provinces";
export {
  createListRegimentUnitsTool,
  defaultRegimentUnitsRuntime,
  listRegimentUnitsTool,
  type RegimentUnit,
  type RegimentUnitsRuntime,
} from "./tools/list-regiment-units";
export {
  createListRegimentsTool,
  listRegimentsTool,
  readRegimentsFromPack,
} from "./tools/list-regiments";
export {
  createListReligionsTool,
  listReligionsTool,
} from "./tools/list-religions";
export {
  createListRiversTool,
  listRiversTool,
  readRiversFromPack,
  resolveBasinRef,
} from "./tools/list-rivers";
export {
  createListRoutesTool,
  listRoutesTool,
  ROUTE_GROUPS,
  readRoutesFromPack,
  resolveRouteGroup,
} from "./tools/list-routes";
export {
  createListRulersTool,
  listRulersTool,
  type RulerSummary,
  type RulersRuntime,
  readRulersFromCollection,
} from "./tools/list-rulers";
export {
  createListStatesTool,
  listStatesTool,
} from "./tools/list-states";
export {
  createListStylePresetsTool,
  defaultStylePresetListRuntime,
  listStylePresetsTool,
  type StylePresetEntry,
  type StylePresetListRuntime,
} from "./tools/list-style-presets";
export {
  createListZonesTool,
  listZonesTool,
  readZonesFromPack,
} from "./tools/list-zones";
export {
  createLoadMapTool,
  isValidMapUrl,
  loadMapTool,
  resolveLoadSource,
} from "./tools/load-map";
export {
  createMaskHeightmapTool,
  maskHeightmapTool,
} from "./tools/mask-heightmap";
export {
  createMeasureDistanceTool,
  defaultMeasureDistanceRuntime,
  type MeasureDistanceRuntime,
  type MeasureInPackResult,
  type MeasureResult,
  measureDistanceInPack,
  measureDistanceTool,
  type PointSpec,
} from "./tools/measure-distance";
export {
  createMergeStatesTool,
  mergeStatesTool,
} from "./tools/merge-states";
export {
  createModifyHeightmapTool,
  modifyHeightmapTool,
} from "./tools/modify-heightmap";
export {
  createMoveBurgTool,
  moveBurgTool,
} from "./tools/move-burg";
export {
  createMoveMarkerTool,
  moveMarkerTool,
} from "./tools/move-marker";
export {
  createMoveRegimentTool,
  moveRegimentTool,
} from "./tools/move-regiment";
export {
  createRegenerateAllBurgNamesTool,
  regenerateAllBurgNamesTool,
} from "./tools/regenerate-all-burg-names";
export {
  CULTURE_NAME_MODES,
  createRegenerateAllCultureNamesTool,
  regenerateAllCultureNamesTool,
  resolveCultureNameMode,
} from "./tools/regenerate-all-culture-names";
export {
  createRegenerateAllProvinceNamesTool,
  regenerateAllProvinceNamesTool,
} from "./tools/regenerate-all-province-names";
export {
  createRegenerateAllStateNamesTool,
  regenerateAllStateNamesTool,
} from "./tools/regenerate-all-state-names";
export {
  createRegenerateBurgCoaTool,
  regenerateBurgCoaTool,
} from "./tools/regenerate-burg-coa";
export {
  BURG_NAME_MODES,
  createRegenerateBurgNameTool,
  regenerateBurgNameTool,
  resolveBurgNameMode,
} from "./tools/regenerate-burg-name";
export {
  createRegenerateDomainTool,
  DOMAIN_TO_GLOBAL,
  REGENERATE_DOMAINS,
  regenerateDomainTool,
  resolveRegenerateDomain,
} from "./tools/regenerate-domain";
export {
  createRegenerateEmblemsTool,
  regenerateEmblemsTool,
} from "./tools/regenerate-emblems";
export {
  createRegenerateMapTool,
  regenerateMapTool,
} from "./tools/regenerate-map";
export {
  createRegenerateProvinceCoaTool,
  regenerateProvinceCoaTool,
} from "./tools/regenerate-province-coa";
export {
  composeProvinceFullName,
  createRegenerateProvinceNameTool,
  PROVINCE_NAME_MODES,
  regenerateProvinceNameTool,
  resolveProvinceNameMode,
} from "./tools/regenerate-province-name";
export {
  createRegenerateRegimentNamesTool,
  regenerateRegimentNamesTool,
} from "./tools/regenerate-regiment-names";
export {
  createRegenerateReligionNamesTool,
  regenerateReligionNamesTool,
} from "./tools/regenerate-religion-names";
export {
  createRegenerateRiverNamesTool,
  RIVER_NAME_MODES,
  regenerateRiverNamesTool,
  resolveRiverNameMode,
} from "./tools/regenerate-river-names";
export {
  createRegenerateStateCoaTool,
  regenerateStateCoaTool,
} from "./tools/regenerate-state-coa";
export {
  createRegenerateStateNameTool,
  regenerateStateNameTool,
  resolveStateNameMode,
  STATE_NAME_MODES,
} from "./tools/regenerate-state-name";
export {
  createRegenerateZonesTool,
  DEFAULT_ZONES_MULTIPLIER,
  regenerateZonesTool,
} from "./tools/regenerate-zones";
export {
  createRemoveBiomeTool,
  DEFAULT_BIOME_COUNT,
  removeBiomeTool,
} from "./tools/remove-biome";
export {
  createRemoveBurgTool,
  removeBurgTool,
} from "./tools/remove-burg";
export {
  createRemoveCultureTool,
  removeCultureTool,
} from "./tools/remove-culture";
export {
  createRemoveMarkerTool,
  removeMarkerTool,
} from "./tools/remove-marker";
export {
  createRemoveNoteTool,
  removeNoteTool,
} from "./tools/remove-note";
export {
  createRemoveProvinceTool,
  removeProvinceTool,
} from "./tools/remove-province";
export {
  createRemoveRegimentTool,
  removeRegimentTool,
} from "./tools/remove-regiment";
export {
  createRemoveReligionTool,
  removeReligionTool,
} from "./tools/remove-religion";
export {
  createRemoveRiverTool,
  removeRiverTool,
} from "./tools/remove-river";
export {
  createRemoveRouteTool,
  removeRouteTool,
} from "./tools/remove-route";
export {
  createRemoveRulerTool,
  defaultRulerRemovalRuntime,
  type RulerRemovalRuntime,
  removeRulerTool,
} from "./tools/remove-ruler";
export {
  createRemoveStateTool,
  removeStateTool,
} from "./tools/remove-state";
export {
  createRemoveZoneTool,
  removeZoneTool,
} from "./tools/remove-zone";
export {
  createRenameBiomeTool,
  findBiomeByRef,
  renameBiomeTool,
} from "./tools/rename-biome";
export {
  createRenameBurgTool,
  renameBurgTool,
} from "./tools/rename-burg";
export {
  createRenameCultureTool,
  renameCultureTool,
} from "./tools/rename-culture";
export {
  createRenameProvinceTool,
  renameProvinceTool,
} from "./tools/rename-province";
export {
  createRenameRegimentTool,
  findRegimentByRef,
  renameRegimentTool,
} from "./tools/rename-regiment";
export {
  createRenameReligionTool,
  renameReligionTool,
} from "./tools/rename-religion";
export {
  createRenameRiverTool,
  findRiverByRef,
  renameRiverTool,
} from "./tools/rename-river";
export {
  createRenameRouteTool,
  findRouteByRef,
  renameRouteTool,
} from "./tools/rename-route";
export {
  createRenameStateTool,
  renameStateTool,
} from "./tools/rename-state";
export {
  createRenameZoneTool,
  renameZoneTool,
} from "./tools/rename-zone";
export {
  createSaveMapTool,
  resolveSaveTarget,
  saveMapTool,
} from "./tools/save-map";
export {
  createSetBiomeColorTool,
  setBiomeColorTool,
} from "./tools/set-biome-color";
export {
  createSetBiomeCostTool,
  setBiomeCostTool,
} from "./tools/set-biome-cost";
export {
  createSetBiomeHabitabilityTool,
  setBiomeHabitabilityTool,
} from "./tools/set-biome-habitability";
export {
  createSetBiomeIconsTool,
  setBiomeIconsTool,
} from "./tools/set-biome-icons";
export {
  createSetBiomeIconsDensityTool,
  setBiomeIconsDensityTool,
} from "./tools/set-biome-icons-density";
export {
  createSetBurgCoaCustomTool,
  setBurgCoaCustomTool,
} from "./tools/set-burg-coa-custom";
export {
  createSetBurgCultureTool,
  setBurgCultureTool,
} from "./tools/set-burg-culture";
export {
  BURG_FEATURES,
  createSetBurgFeatureTool,
  resolveBurgFeature,
  setBurgFeatureTool,
} from "./tools/set-burg-feature";
export {
  createSetBurgGroupTool,
  setBurgGroupTool,
} from "./tools/set-burg-group";
export {
  createSetBurgPopulationTool,
  scaleDisplayToInternal,
  scaleInternalToDisplay,
  setBurgPopulationTool,
} from "./tools/set-burg-population";
export {
  createSetBurgPortTool,
  setBurgPortTool,
} from "./tools/set-burg-port";
export {
  BURG_TYPES,
  createSetBurgTypeTool,
  resolveBurgType,
  setBurgTypeTool,
} from "./tools/set-burg-type";
export {
  createSetCellHeightTool,
  setCellHeightTool,
} from "./tools/set-cell-height";
export {
  CELLS_DENSITY_MAP,
  CELLS_DENSITY_OPTIONS,
  createSetCellsDensityTool,
  resolveCellsLevel,
  setCellsDensityTool,
} from "./tools/set-cells-density";
export {
  CLIMATE_FIELDS,
  createSetClimateTool,
  setClimateTool,
} from "./tools/set-climate";
export {
  createSetCultureBaseTool,
  resolveNameBase,
  setCultureBaseTool,
} from "./tools/set-culture-base";
export {
  createSetCultureCenterTool,
  setCultureCenterTool,
} from "./tools/set-culture-center";
export {
  createSetCultureColorTool,
  setCultureColorTool,
} from "./tools/set-culture-color";
export {
  createSetCultureOriginsTool,
  setCultureOriginsTool,
} from "./tools/set-culture-origins";
export {
  CULTURE_SHIELDS,
  createSetCultureShieldTool,
  resolveCultureShield,
  setCultureShieldTool,
} from "./tools/set-culture-shield";
export {
  CULTURE_TYPES,
  createSetCultureTypeTool,
  resolveCultureType,
  setCultureTypeTool,
} from "./tools/set-culture-type";
export {
  CULTURES_SETS,
  createSetCulturesSetTool,
  resolveCulturesSet,
  setCulturesSetTool,
} from "./tools/set-cultures-set";
export {
  createSetDefaultEmblemShapeTool,
  DEFAULT_EMBLEM_SHAPES,
  DIVERSIFORM_SHAPES,
  resolveEmblemShape,
  setDefaultEmblemShapeTool,
} from "./tools/set-default-emblem-shape";
export {
  createSetDiplomacyTool,
  DIPLOMACY_RELATIONS,
  resolveRelation,
  reverseRelation,
  setDiplomacyTool,
} from "./tools/set-diplomacy";
export {
  createSetEntityExpansionismTool,
  EXPANSIONABLE_TYPES,
  resolveExpansionableType,
  setEntityExpansionismTool,
} from "./tools/set-entity-expansionism";
export {
  createSetEntityLockTool,
  LOCKABLE_TYPES,
  resolveLockableType,
  setEntityLockTool,
} from "./tools/set-entity-lock";
export {
  createSetFontFamilyTool,
  defaultFontFamilyRuntime,
  FONT_LAYERS,
  type FontFamilyRuntime,
  type FontLayerSpec,
  setFontFamilyTool,
} from "./tools/set-font-family";
export {
  createSetFontSizeTool,
  defaultFontSizeRuntime,
  FONT_SIZE_MAX,
  FONT_SIZE_MIN,
  type FontSizeRuntime,
  setFontSizeTool,
} from "./tools/set-font-size";
export {
  createSetGeneratorRatesTool,
  GENERATOR_FIELDS,
  setGeneratorRatesTool,
} from "./tools/set-generator-rates";
export {
  createSetGeographyTool,
  GEOGRAPHY_FIELDS,
  setGeographyTool,
} from "./tools/set-geography";
export {
  createSetHeightExponentTool,
  setHeightExponentTool,
} from "./tools/set-height-exponent";
export {
  createSetHeightmapOptionsTool,
  HEIGHTMAP_OPTION_KEYS,
  setHeightmapOptionsTool,
} from "./tools/set-heightmap-options";
export {
  createSetHeightmapTemplateTool,
  DISPLAY_NAMES as HEIGHTMAP_TEMPLATE_DISPLAY_NAMES,
  resolveTemplateKey,
  setHeightmapTemplateTool,
  TEMPLATE_KEYS,
} from "./tools/set-heightmap-template";
export {
  createSetLabelTextTool,
  defaultSetLabelTextRuntime,
  setLabelTextTool,
} from "./tools/set-label-text";
export {
  createSetLayerFillTool,
  defaultLayerFillRuntime,
  type LayerFillRuntime,
  setLayerFillTool,
} from "./tools/set-layer-fill";
export {
  createSetLayerFilterTool,
  defaultLayerFilterRuntime,
  FILTER_IDS,
  type FilterId,
  type LayerFilterRuntime,
  setLayerFilterTool,
} from "./tools/set-layer-filter";
export {
  createSetLayerOpacityTool,
  defaultLayerOpacityRuntime,
  type LayerOpacityRuntime,
  OPACITY_MAX,
  OPACITY_MIN,
  setLayerOpacityTool,
} from "./tools/set-layer-opacity";
export {
  createSetLayerStrokeColorTool,
  defaultLayerStrokeColorRuntime,
  type LayerStrokeColorRuntime,
  setLayerStrokeColorTool,
} from "./tools/set-layer-stroke-color";
export {
  createSetLayerStrokeDasharrayTool,
  defaultLayerStrokeDasharrayRuntime,
  type LayerStrokeDasharrayRuntime,
  setLayerStrokeDasharrayTool,
} from "./tools/set-layer-stroke-dasharray";
export {
  createSetLayerStrokeWidthTool,
  defaultLayerStrokeWidthRuntime,
  type LayerStrokeWidthRuntime,
  setLayerStrokeWidthTool,
  WIDTH_MAX,
  WIDTH_MIN,
} from "./tools/set-layer-stroke-width";
export {
  createSetLayerVisibilityTool,
  LAYER_SPECS,
  setLayerVisibilityTool,
} from "./tools/set-layer-visibility";
export { setMapNameTool } from "./tools/set-map-name";
export {
  createSetMarkerColorsTool,
  DEFAULT_MARKER_FILL,
  DEFAULT_MARKER_STROKE,
  setMarkerColorsTool,
} from "./tools/set-marker-colors";
export {
  createSetMarkerIconTool,
  setMarkerIconTool,
} from "./tools/set-marker-icon";
export {
  createSetMarkerIconSizeTool,
  DEFAULT_MARKER_ICON_SIZE,
  MARKER_ICON_SIZE_MAX,
  MARKER_ICON_SIZE_MIN,
  setMarkerIconSizeTool,
} from "./tools/set-marker-icon-size";
export {
  createSetMarkerLockTool,
  setMarkerLockTool,
} from "./tools/set-marker-lock";
export {
  createSetMarkerNoteTool,
  findMarkerNoteRef,
  setMarkerNoteTool,
} from "./tools/set-marker-note";
export {
  createSetMarkerPinTool,
  DEFAULT_MARKER_PIN,
  MARKER_PIN_SHAPES,
  resolveMarkerPin,
  setMarkerPinTool,
} from "./tools/set-marker-pin";
export {
  createSetMarkerPinnedTool,
  setMarkerPinnedTool,
} from "./tools/set-marker-pinned";
export {
  createSetMarkerShiftTool,
  DEFAULT_MARKER_SHIFT,
  MARKER_SHIFT_MAX,
  MARKER_SHIFT_MIN,
  setMarkerShiftTool,
} from "./tools/set-marker-shift";
export {
  createSetMarkerSizeTool,
  DEFAULT_MARKER_SIZE,
  setMarkerSizeTool,
} from "./tools/set-marker-size";
export {
  createSetMarkerTypeTool,
  setMarkerTypeTool,
} from "./tools/set-marker-type";
export {
  canonDistance,
  canonHeight,
  canonTemperature,
  createSetMeasurementUnitsTool,
  setMeasurementUnitsTool,
} from "./tools/set-measurement-units";
export {
  createSetNoteTool,
  setNoteTool,
} from "./tools/set-note";
export {
  createSetOnloadBehaviorTool,
  ONLOAD_BEHAVIORS,
  resolveOnloadBehavior,
  setOnloadBehaviorTool,
} from "./tools/set-onload-behavior";
export {
  createSetPrecipitationTool,
  PRECIPITATION_MAX,
  PRECIPITATION_MIN,
  setPrecipitationTool,
} from "./tools/set-precipitation";
export {
  createSetProvinceCapitalTool,
  setProvinceCapitalTool,
} from "./tools/set-province-capital";
export {
  createSetProvinceCoaCustomTool,
  setProvinceCoaCustomTool,
} from "./tools/set-province-coa-custom";
export {
  createSetProvinceColorTool,
  setProvinceColorTool,
} from "./tools/set-province-color";
export {
  createSetProvinceFormTool,
  setProvinceFormTool,
} from "./tools/set-province-form";
export {
  createSetRegimentIconTool,
  setRegimentIconTool,
} from "./tools/set-regiment-icon";
export {
  createSetRegimentNavalTool,
  setRegimentNavalTool,
} from "./tools/set-regiment-naval";
export {
  createSetRegimentUnitTool,
  setRegimentUnitTool,
} from "./tools/set-regiment-unit";
export {
  createSetReligionCenterTool,
  setReligionCenterTool,
} from "./tools/set-religion-center";
export {
  createSetReligionColorTool,
  setReligionColorTool,
} from "./tools/set-religion-color";
export {
  createSetReligionCultureTool,
  setReligionCultureTool,
} from "./tools/set-religion-culture";
export {
  createSetReligionDeityTool,
  setReligionDeityTool,
} from "./tools/set-religion-deity";
export {
  createSetReligionExpansionTool,
  RELIGION_EXPANSIONS,
  resolveReligionExpansion,
  setReligionExpansionTool,
} from "./tools/set-religion-expansion";
export {
  createSetReligionFormTool,
  setReligionFormTool,
} from "./tools/set-religion-form";
export {
  createSetReligionOriginsTool,
  setReligionOriginsTool,
} from "./tools/set-religion-origins";
export {
  createSetReligionTypeTool,
  RELIGION_TYPES,
  resolveReligionType,
  setReligionTypeTool,
} from "./tools/set-religion-type";
export {
  createSetRiverTypeTool,
  setRiverTypeTool,
} from "./tools/set-river-type";
export {
  createSetRiverWidthTool,
  DEFAULT_RIVER_SOURCE_WIDTH,
  DEFAULT_RIVER_WIDTH_FACTOR,
  SOURCE_WIDTH_MAX,
  SOURCE_WIDTH_MIN,
  setRiverWidthTool,
  WIDTH_FACTOR_MAX,
  WIDTH_FACTOR_MIN,
} from "./tools/set-river-width";
export {
  createSetRouteGroupTool,
  setRouteGroupTool,
} from "./tools/set-route-group";
export {
  createSetRouteLockTool,
  setRouteLockTool,
} from "./tools/set-route-lock";
export {
  createSetStateCapitalTool,
  setStateCapitalTool,
} from "./tools/set-state-capital";
export {
  createSetStateCoaCustomTool,
  setStateCoaCustomTool,
} from "./tools/set-state-coa-custom";
export {
  createSetStateColorTool,
  isValidCssColor,
  setStateColorTool,
} from "./tools/set-state-color";
export {
  createSetStateCultureTool,
  setStateCultureTool,
} from "./tools/set-state-culture";
export {
  allCanonicalFormNames,
  createSetStateFormTool,
  FORM_CATEGORIES,
  FORMS_BY_CATEGORY,
  resolveFormName,
  setStateFormTool,
} from "./tools/set-state-form";
export {
  createSetStateLabelsModeTool,
  resolveStateLabelsMode,
  STATE_LABELS_MODES,
  setStateLabelsModeTool,
} from "./tools/set-state-labels-mode";
export {
  createSetStateTypeTool,
  resolveStateType,
  STATE_TYPES,
  setStateTypeTool,
} from "./tools/set-state-type";
export {
  createSetStylePresetTool,
  resolveStylePreset,
  STYLE_PRESETS,
  setStylePresetTool,
} from "./tools/set-style-preset";
export {
  createSetWindTool,
  DEFAULT_WINDS,
  normaliseAngle as normaliseWindAngle,
  resolveBand as resolveWindBand,
  setWindTool,
  WIND_BAND_ALIASES,
  WIND_BAND_COUNT,
} from "./tools/set-wind";
export {
  createSetWorldRatesTool,
  setWorldRatesTool,
  validateRatesInput,
} from "./tools/set-world-rates";
export {
  createSetYearAndEraTool,
  deriveEraShort,
  setYearAndEraTool,
} from "./tools/set-year-and-era";
export {
  createSetZoneColorTool,
  setZoneColorTool,
} from "./tools/set-zone-color";
export {
  createSetZoneTypeTool,
  setZoneTypeTool,
} from "./tools/set-zone-type";
export {
  createSetZoneVisibilityTool,
  findZoneByRef,
  setZoneVisibilityTool,
} from "./tools/set-zone-visibility";
export {
  createSmoothHeightmapTool,
  DEFAULT_SMOOTH_ADD,
  DEFAULT_SMOOTH_FACTOR,
  smoothHeightmapTool,
} from "./tools/smooth-heightmap";
export {
  createSplitRegimentTool,
  splitRegimentTool,
} from "./tools/split-regiment";

export function buildDefaultRegistry(): ToolRegistry {
  const registry = new ToolRegistry();
  registry.register(getMapInfoTool);
  registry.register(getPopulationStatsTool);
  registry.register(getTerrainStatsTool);
  registry.register(getClimateStatsTool);
  registry.register(getReligionDistributionTool);
  registry.register(getCultureDistributionTool);
  registry.register(getStateDistributionTool);
  registry.register(getProvinceDistributionTool);
  registry.register(getCellInfoTool);
  registry.register(getStateInfoTool);
  registry.register(getReligionInfoTool);
  registry.register(getBurgInfoTool);
  registry.register(getCultureInfoTool);
  registry.register(getProvinceInfoTool);
  registry.register(getRiverInfoTool);
  registry.register(getRouteInfoTool);
  registry.register(getBiomeInfoTool);
  registry.register(getBiomeDistributionTool);
  registry.register(getFeatureDistributionTool);
  registry.register(getBurgDistributionTool);
  registry.register(getRiverDistributionTool);
  registry.register(getMarkerInfoTool);
  registry.register(getNoteInfoTool);
  registry.register(getRegimentInfoTool);
  registry.register(getZoneInfoTool);
  registry.register(getFeatureInfoTool);
  registry.register(getEntityCellsTool);
  registry.register(getEntityBboxTool);
  registry.register(getEntityCentroidTool);
  registry.register(getDiplomacyBetweenTool);
  registry.register(findAdjacentEntitiesTool);
  registry.register(findCellsAdjacentToEntityTool);
  registry.register(findCellAtCoordsTool);
  registry.register(findCellsInRadiusTool);
  registry.register(findCellsByBiomeTool);
  registry.register(findCellsByFeatureTool);
  registry.register(findCellsByHeightRangeTool);
  registry.register(findHighestPeaksTool);
  registry.register(findCellsByTemperatureRangeTool);
  registry.register(findCellsByPrecipitationRangeTool);
  registry.register(findCellsByPopulationRangeTool);
  registry.register(findCoastCellsTool);
  registry.register(findOrphanCellsTool);
  registry.register(listStatesTool);
  registry.register(listStylePresetsTool);
  registry.register(listBurgsTool);
  registry.register(findNearestBurgTool);
  registry.register(findBurgsInAreaTool);
  registry.register(findBurgsByStateTool);
  registry.register(findBurgsByCultureTool);
  registry.register(findBurgsByReligionTool);
  registry.register(findBurgsByFeatureTool);
  registry.register(findBurgsByTypeTool);
  registry.register(findBurgsByPopulationRangeTool);
  registry.register(findLargestBurgsTool);
  registry.register(findLargestStatesTool);
  registry.register(findLargestCulturesTool);
  registry.register(findLargestFeaturesTool);
  registry.register(findLargestReligionsTool);
  registry.register(findLargestProvincesTool);
  registry.register(findProvincesByStateTool);
  registry.register(findProvincesInAreaTool);
  registry.register(findRegimentsByStateTool);
  registry.register(findRegimentsByTypeTool);
  registry.register(findStatesByCultureTool);
  registry.register(findStatesByTypeTool);
  registry.register(findStatesInAreaTool);
  registry.register(findReligionsByCultureTool);
  registry.register(findReligionsByTypeTool);
  registry.register(findReligionsInAreaTool);
  registry.register(findCulturesByTypeTool);
  registry.register(findCulturesInAreaTool);
  registry.register(measureDistanceTool);
  registry.register(listBiomesTool);
  registry.register(listCulturesTool);
  registry.register(listDiplomacyTool);
  registry.register(listFeaturesTool);
  registry.register(listHeightmapTemplatesTool);
  registry.register(listReligionsTool);
  registry.register(listProvincesTool);
  registry.register(listMarkersTool);
  registry.register(listMarkerTypesTool);
  registry.register(findNearestMarkerTool);
  registry.register(findMarkersInAreaTool);
  registry.register(findMarkersByTypeTool);
  registry.register(findMarkersByStateTool);
  registry.register(listRiversTool);
  registry.register(findNearestRiverTool);
  registry.register(findRiversInAreaTool);
  registry.register(findRiversByBasinTool);
  registry.register(findRiversByStateTool);
  registry.register(findLongestRiversTool);
  registry.register(listRoutesTool);
  registry.register(findRoutesByGroupTool);
  registry.register(listRulersTool);
  registry.register(listRegimentsTool);
  registry.register(listNotesTool);
  registry.register(findNotesByPrefixTool);
  registry.register(listZonesTool);
  registry.register(findZonesByTypeTool);
  registry.register(getZoneDistributionTool);
  registry.register(setMapNameTool);
  registry.register(setLabelTextTool);
  registry.register(setMeasurementUnitsTool);
  registry.register(setClimateTool);
  registry.register(setCellsDensityTool);
  registry.register(setGeographyTool);
  registry.register(setGeneratorRatesTool);
  registry.register(setHeightExponentTool);
  registry.register(renameStateTool);
  registry.register(renameBurgTool);
  registry.register(renameBiomeTool);
  registry.register(setBiomeColorTool);
  registry.register(setBiomeCostTool);
  registry.register(setBiomeHabitabilityTool);
  registry.register(setBiomeIconsDensityTool);
  registry.register(setBiomeIconsTool);
  registry.register(removeBiomeTool);
  registry.register(renameCultureTool);
  registry.register(renameReligionTool);
  registry.register(renameProvinceTool);
  registry.register(renameRiverTool);
  registry.register(renameRouteTool);
  registry.register(setRouteGroupTool);
  registry.register(setRouteLockTool);
  registry.register(removeRouteTool);
  registry.register(addRouteTool);
  registry.register(renameRegimentTool);
  registry.register(listRegimentUnitsTool);
  registry.register(setRegimentUnitTool);
  registry.register(setRegimentNavalTool);
  registry.register(setRegimentIconTool);
  registry.register(splitRegimentTool);
  registry.register(renameZoneTool);
  registry.register(setStateColorTool);
  registry.register(setCultureColorTool);
  registry.register(setCultureTypeTool);
  registry.register(setCultureBaseTool);
  registry.register(setCultureCenterTool);
  registry.register(setCultureOriginsTool);
  registry.register(setCultureShieldTool);
  registry.register(setCulturesSetTool);
  registry.register(listCulturesSetsTool);
  registry.register(setDefaultEmblemShapeTool);
  registry.register(listEmblemShapesTool);
  registry.register(setReligionCenterTool);
  registry.register(setReligionColorTool);
  registry.register(setReligionTypeTool);
  registry.register(setReligionFormTool);
  registry.register(setReligionDeityTool);
  registry.register(setReligionExpansionTool);
  registry.register(setReligionCultureTool);
  registry.register(setReligionOriginsTool);
  registry.register(setProvinceColorTool);
  registry.register(setZoneColorTool);
  registry.register(setZoneTypeTool);
  registry.register(setRiverTypeTool);
  registry.register(setRiverWidthTool);
  registry.register(setBurgPopulationTool);
  registry.register(setBurgCultureTool);
  registry.register(setBurgTypeTool);
  registry.register(setBurgFeatureTool);
  registry.register(setBurgPortTool);
  registry.register(setBurgGroupTool);
  registry.register(setStateCapitalTool);
  registry.register(setStateCultureTool);
  registry.register(setProvinceCapitalTool);
  registry.register(setEntityExpansionismTool);
  registry.register(setDiplomacyTool);
  registry.register(setMarkerNoteTool);
  registry.register(setMarkerPinnedTool);
  registry.register(setMarkerLockTool);
  registry.register(setMarkerTypeTool);
  registry.register(setMarkerIconTool);
  registry.register(setMarkerSizeTool);
  registry.register(setMarkerIconSizeTool);
  registry.register(setMarkerShiftTool);
  registry.register(setMarkerPinTool);
  registry.register(listMarkerPinsTool);
  registry.register(setMarkerColorsTool);
  registry.register(setNoteTool);
  registry.register(setHeightmapTemplateTool);
  registry.register(setHeightmapOptionsTool);
  registry.register(smoothHeightmapTool);
  registry.register(addHillTool);
  registry.register(addRangeTool);
  registry.register(addPitTool);
  registry.register(addTroughTool);
  registry.register(addStraitTool);
  registry.register(modifyHeightmapTool);
  registry.register(maskHeightmapTool);
  registry.register(invertHeightmapTool);
  registry.register(clearHeightmapTool);
  registry.register(setCellHeightTool);
  registry.register(setEntityLockTool);
  registry.register(setStateFormTool);
  registry.register(setProvinceFormTool);
  registry.register(setStateTypeTool);
  registry.register(setStateLabelsModeTool);
  registry.register(setStylePresetTool);
  registry.register(setOnloadBehaviorTool);
  registry.register(setPrecipitationTool);
  registry.register(setWindTool);
  registry.register(setWorldRatesTool);
  registry.register(setLayerVisibilityTool);
  registry.register(applyLayersPresetTool);
  registry.register(setLayerOpacityTool);
  registry.register(setLayerStrokeWidthTool);
  registry.register(setLayerStrokeColorTool);
  registry.register(setLayerStrokeDasharrayTool);
  registry.register(setLayerFilterTool);
  registry.register(setLayerFillTool);
  registry.register(getLayerStyleTool);
  registry.register(setFontFamilyTool);
  registry.register(setFontSizeTool);
  registry.register(setYearAndEraTool);
  registry.register(setZoneVisibilityTool);
  registry.register(focusOnMapTool);
  registry.register(regenerateMapTool);
  registry.register(regenerateEmblemsTool);
  registry.register(regenerateBurgCoaTool);
  registry.register(regenerateStateCoaTool);
  registry.register(regenerateProvinceCoaTool);
  registry.register(setBurgCoaCustomTool);
  registry.register(setStateCoaCustomTool);
  registry.register(setProvinceCoaCustomTool);
  registry.register(regenerateDomainTool);
  registry.register(regenerateBurgNameTool);
  registry.register(regenerateStateNameTool);
  registry.register(regenerateProvinceNameTool);
  registry.register(regenerateAllBurgNamesTool);
  registry.register(regenerateAllCultureNamesTool);
  registry.register(regenerateAllProvinceNamesTool);
  registry.register(regenerateAllStateNamesTool);
  registry.register(regenerateRegimentNamesTool);
  registry.register(regenerateReligionNamesTool);
  registry.register(regenerateRiverNamesTool);
  registry.register(regenerateZonesTool);
  registry.register(clearRulersTool);
  registry.register(saveMapTool);
  registry.register(loadMapTool);
  registry.register(exportMapTool);
  registry.register(removeBurgTool);
  registry.register(removeCultureTool);
  registry.register(removeMarkerTool);
  registry.register(addMarkerTool);
  registry.register(addRulerTool);
  registry.register(addBurgTool);
  registry.register(addCultureTool);
  registry.register(addReligionTool);
  registry.register(addRegimentTool);
  registry.register(addStateTool);
  registry.register(addProvinceTool);
  registry.register(addZoneTool);
  registry.register(addBiomeTool);
  registry.register(moveMarkerTool);
  registry.register(moveRegimentTool);
  registry.register(moveBurgTool);
  registry.register(mergeStatesTool);
  registry.register(removeNoteTool);
  registry.register(removeProvinceTool);
  registry.register(removeRegimentTool);
  registry.register(removeReligionTool);
  registry.register(removeRiverTool);
  registry.register(removeRulerTool);
  registry.register(removeStateTool);
  registry.register(removeZoneTool);
  return registry;
}

export function bootstrapAiChat(): void {
  const registry = buildDefaultRegistry();

  const makeClient = () => {
    const key = getApiKey();
    if (!key) throw new Error("No Anthropic API key set.");
    return new AnthropicClient({ apiKey: key });
  };

  const clientProxy = {
    async sendMessage(req: Parameters<AnthropicClient["sendMessage"]>[0]) {
      return makeClient().sendMessage(req);
    },
  };

  const controller = new ChatController({ client: clientProxy, registry });
  mountChatWindow({ controller });
}

if (typeof document !== "undefined") {
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", bootstrapAiChat, {
      once: true,
    });
  } else {
    bootstrapAiChat();
  }
}
