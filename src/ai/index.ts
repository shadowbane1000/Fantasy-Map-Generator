import { AnthropicClient } from "./anthropic-client";
import { getApiKey } from "./api-key";
import { ChatController } from "./chat-controller";
import { mountChatWindow } from "./chat-window";
import { ToolRegistry } from "./tools";
import { addMarkerTool } from "./tools/add-marker";
import { applyLayersPresetTool } from "./tools/apply-layers-preset";
import { exportMapTool } from "./tools/export-map";
import { focusOnMapTool } from "./tools/focus-on-map";
import { getMapInfoTool } from "./tools/get-map-info";
import { listBurgsTool } from "./tools/list-burgs";
import { listCulturesTool } from "./tools/list-cultures";
import { listMarkersTool } from "./tools/list-markers";
import { listNotesTool } from "./tools/list-notes";
import { listProvincesTool } from "./tools/list-provinces";
import { listRegimentsTool } from "./tools/list-regiments";
import { listReligionsTool } from "./tools/list-religions";
import { listRiversTool } from "./tools/list-rivers";
import { listRoutesTool } from "./tools/list-routes";
import { listStatesTool } from "./tools/list-states";
import { listZonesTool } from "./tools/list-zones";
import { loadMapTool } from "./tools/load-map";
import { regenerateMapTool } from "./tools/regenerate-map";
import { removeBurgTool } from "./tools/remove-burg";
import { removeMarkerTool } from "./tools/remove-marker";
import { removeNoteTool } from "./tools/remove-note";
import { removeRegimentTool } from "./tools/remove-regiment";
import { removeZoneTool } from "./tools/remove-zone";
import { renameBurgTool } from "./tools/rename-burg";
import { renameCultureTool } from "./tools/rename-culture";
import { renameProvinceTool } from "./tools/rename-province";
import { renameRegimentTool } from "./tools/rename-regiment";
import { renameReligionTool } from "./tools/rename-religion";
import { renameRiverTool } from "./tools/rename-river";
import { renameStateTool } from "./tools/rename-state";
import { renameZoneTool } from "./tools/rename-zone";
import { saveMapTool } from "./tools/save-map";
import { setBurgCultureTool } from "./tools/set-burg-culture";
import { setBurgPopulationTool } from "./tools/set-burg-population";
import { setBurgTypeTool } from "./tools/set-burg-type";
import { setClimateTool } from "./tools/set-climate";
import { setCultureColorTool } from "./tools/set-culture-color";
import { setEntityExpansionismTool } from "./tools/set-entity-expansionism";
import { setEntityLockTool } from "./tools/set-entity-lock";
import { setGeographyTool } from "./tools/set-geography";
import { setHeightmapTemplateTool } from "./tools/set-heightmap-template";
import { setLayerVisibilityTool } from "./tools/set-layer-visibility";
import { setMapNameTool } from "./tools/set-map-name";
import { setMarkerLockTool } from "./tools/set-marker-lock";
import { setMarkerNoteTool } from "./tools/set-marker-note";
import { setMarkerPinnedTool } from "./tools/set-marker-pinned";
import { setMeasurementUnitsTool } from "./tools/set-measurement-units";
import { setNoteTool } from "./tools/set-note";
import { setProvinceColorTool } from "./tools/set-province-color";
import { setReligionColorTool } from "./tools/set-religion-color";
import { setRiverTypeTool } from "./tools/set-river-type";
import { setStateCapitalTool } from "./tools/set-state-capital";
import { setStateColorTool } from "./tools/set-state-color";
import { setStateFormTool } from "./tools/set-state-form";
import { setWorldRatesTool } from "./tools/set-world-rates";
import { setYearAndEraTool } from "./tools/set-year-and-era";
import { setZoneColorTool } from "./tools/set-zone-color";
import { setZoneVisibilityTool } from "./tools/set-zone-visibility";

export { AnthropicApiError, AnthropicClient } from "./anthropic-client";
export { clearApiKey, getApiKey, setApiKey } from "./api-key";
export { ChatController } from "./chat-controller";
export { mountChatWindow } from "./chat-window";
export { ToolRegistry } from "./tools";
export {
  addMarkerTool,
  createAddMarkerTool,
} from "./tools/add-marker";
export {
  applyLayersPresetTool,
  createApplyLayersPresetTool,
} from "./tools/apply-layers-preset";
export {
  createExportMapTool,
  EXPORT_FORMATS,
  exportMapTool,
  resolveExportFormat,
} from "./tools/export-map";
export {
  createFocusOnMapTool,
  focusOnMapTool,
} from "./tools/focus-on-map";
export {
  createGetMapInfoTool,
  getMapInfoTool,
} from "./tools/get-map-info";
export {
  createListBurgsTool,
  listBurgsTool,
} from "./tools/list-burgs";
export {
  createListCulturesTool,
  listCulturesTool,
} from "./tools/list-cultures";
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
  createListStatesTool,
  listStatesTool,
} from "./tools/list-states";
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
  createRegenerateMapTool,
  regenerateMapTool,
} from "./tools/regenerate-map";
export {
  createRemoveBurgTool,
  removeBurgTool,
} from "./tools/remove-burg";
export {
  createRemoveMarkerTool,
  removeMarkerTool,
} from "./tools/remove-marker";
export {
  createRemoveNoteTool,
  removeNoteTool,
} from "./tools/remove-note";
export {
  createRemoveRegimentTool,
  removeRegimentTool,
} from "./tools/remove-regiment";
export {
  createRemoveZoneTool,
  removeZoneTool,
} from "./tools/remove-zone";
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
  createSetBurgCultureTool,
  setBurgCultureTool,
} from "./tools/set-burg-culture";
export {
  createSetBurgPopulationTool,
  scaleDisplayToInternal,
  scaleInternalToDisplay,
  setBurgPopulationTool,
} from "./tools/set-burg-population";
export {
  BURG_TYPES,
  createSetBurgTypeTool,
  resolveBurgType,
  setBurgTypeTool,
} from "./tools/set-burg-type";
export {
  CLIMATE_FIELDS,
  createSetClimateTool,
  setClimateTool,
} from "./tools/set-climate";
export {
  createSetCultureColorTool,
  setCultureColorTool,
} from "./tools/set-culture-color";
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
  createSetGeographyTool,
  GEOGRAPHY_FIELDS,
  setGeographyTool,
} from "./tools/set-geography";
export {
  createSetHeightmapTemplateTool,
  DISPLAY_NAMES as HEIGHTMAP_TEMPLATE_DISPLAY_NAMES,
  resolveTemplateKey,
  setHeightmapTemplateTool,
  TEMPLATE_KEYS,
} from "./tools/set-heightmap-template";
export {
  createSetLayerVisibilityTool,
  setLayerVisibilityTool,
} from "./tools/set-layer-visibility";
export { setMapNameTool } from "./tools/set-map-name";
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
  createSetMarkerPinnedTool,
  setMarkerPinnedTool,
} from "./tools/set-marker-pinned";
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
  createSetProvinceColorTool,
  setProvinceColorTool,
} from "./tools/set-province-color";
export {
  createSetReligionColorTool,
  setReligionColorTool,
} from "./tools/set-religion-color";
export {
  createSetRiverTypeTool,
  setRiverTypeTool,
} from "./tools/set-river-type";
export {
  createSetStateCapitalTool,
  setStateCapitalTool,
} from "./tools/set-state-capital";
export {
  createSetStateColorTool,
  isValidCssColor,
  setStateColorTool,
} from "./tools/set-state-color";
export {
  allCanonicalFormNames,
  createSetStateFormTool,
  FORM_CATEGORIES,
  FORMS_BY_CATEGORY,
  resolveFormName,
  setStateFormTool,
} from "./tools/set-state-form";
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
  createSetZoneVisibilityTool,
  findZoneByRef,
  setZoneVisibilityTool,
} from "./tools/set-zone-visibility";

export function buildDefaultRegistry(): ToolRegistry {
  const registry = new ToolRegistry();
  registry.register(getMapInfoTool);
  registry.register(listStatesTool);
  registry.register(listBurgsTool);
  registry.register(listCulturesTool);
  registry.register(listReligionsTool);
  registry.register(listProvincesTool);
  registry.register(listMarkersTool);
  registry.register(listRiversTool);
  registry.register(listRoutesTool);
  registry.register(listRegimentsTool);
  registry.register(listNotesTool);
  registry.register(listZonesTool);
  registry.register(setMapNameTool);
  registry.register(setMeasurementUnitsTool);
  registry.register(setClimateTool);
  registry.register(setGeographyTool);
  registry.register(renameStateTool);
  registry.register(renameBurgTool);
  registry.register(renameCultureTool);
  registry.register(renameReligionTool);
  registry.register(renameProvinceTool);
  registry.register(renameRiverTool);
  registry.register(renameRegimentTool);
  registry.register(renameZoneTool);
  registry.register(setStateColorTool);
  registry.register(setCultureColorTool);
  registry.register(setReligionColorTool);
  registry.register(setProvinceColorTool);
  registry.register(setZoneColorTool);
  registry.register(setRiverTypeTool);
  registry.register(setBurgPopulationTool);
  registry.register(setBurgCultureTool);
  registry.register(setBurgTypeTool);
  registry.register(setStateCapitalTool);
  registry.register(setEntityExpansionismTool);
  registry.register(setMarkerNoteTool);
  registry.register(setMarkerPinnedTool);
  registry.register(setMarkerLockTool);
  registry.register(setNoteTool);
  registry.register(setHeightmapTemplateTool);
  registry.register(setEntityLockTool);
  registry.register(setStateFormTool);
  registry.register(setWorldRatesTool);
  registry.register(setLayerVisibilityTool);
  registry.register(applyLayersPresetTool);
  registry.register(setYearAndEraTool);
  registry.register(setZoneVisibilityTool);
  registry.register(focusOnMapTool);
  registry.register(regenerateMapTool);
  registry.register(saveMapTool);
  registry.register(loadMapTool);
  registry.register(exportMapTool);
  registry.register(removeBurgTool);
  registry.register(removeMarkerTool);
  registry.register(addMarkerTool);
  registry.register(removeNoteTool);
  registry.register(removeRegimentTool);
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
