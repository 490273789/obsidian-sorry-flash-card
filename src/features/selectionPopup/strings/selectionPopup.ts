import type { Language } from "../../../core/shared/types";

export interface SelectionPopupStrings {
	lookup: string;
	translate: string;
	openInMainTabHint: string;
	emptyDefinition: string;
	loading: string;
	settingsHeading: string;
	enablePopup: string;
	enablePopupDesc: string;
	modifier: string;
	modifierDesc: string;
	modifierNone: string;
	modifierAlt: string;
	modifierShift: string;
	modifierCtrl: string;
	dictionaryDisabled: string;
	translationDisabled: string;
	dictSelectionHeading: string;
	dictSelectionDesc: string;
	noDictionariesAvailable: string;
}

const ZH_STRINGS: SelectionPopupStrings = {
	lookup: "查词",
	translate: "翻译",
	openInMainTabHint: "按 Enter 在主标签页打开",
	emptyDefinition: "未找到释义",
	loading: "正在查询...",
	settingsHeading: "划词助手",
	enablePopup: "启用划词快捷浮窗",
	enablePopupDesc: "在笔记中选中文本松开鼠标时，在鼠标位置显示查词与翻译快捷浮窗。",
	modifier: "触发修饰键",
	modifierDesc: "设置触发浮窗所需的修饰键，避免正常写作或选择文本时光标处频繁弹窗。",
	modifierNone: "无（直接划词抬起鼠标即触发）",
	modifierAlt: "Alt / Option",
	modifierShift: "Shift",
	modifierCtrl: "Ctrl / Command",
	dictionaryDisabled: "词典功能未开启，请先在词典设置中启用",
	translationDisabled: "AI 翻译未开启，请先在翻译设置中启用",
	dictSelectionHeading: "划词展示字典",
	dictSelectionDesc:
		"选择在划词浮窗中展示哪些字典。若全部勾选或全部未选，则默认展示所有已启用的字典。",
	noDictionariesAvailable: "暂无可用的字典源，请先在「词典」设置中启用至少一个字典。",
};

const EN_OVERRIDES: Partial<SelectionPopupStrings> = {
	lookup: "Lookup",
	translate: "Translate",
	openInMainTabHint: "Press Enter to open in main tab",
	emptyDefinition: "No definitions found",
	loading: "Searching...",
	settingsHeading: "Selection Helper",
	enablePopup: "Enable selection popup",
	enablePopupDesc:
		"Show quick lookup and translation popup at mouse position upon selecting text.",
	modifier: "Trigger modifier key",
	modifierDesc:
		"Choose a modifier key to require for the popup to appear, avoiding distractions.",
	modifierNone: "None (Direct selection)",
	modifierAlt: "Alt / Option",
	modifierShift: "Shift",
	modifierCtrl: "Ctrl / Command",
	dictionaryDisabled: "Dictionary is disabled in settings",
	translationDisabled: "Translation is disabled in settings",
	dictSelectionHeading: "Popup Dictionaries",
	dictSelectionDesc:
		"Select which dictionaries to display in the selection popup. If none are explicitly selected, all enabled dictionaries will be shown.",
	noDictionariesAvailable:
		"No dictionary sources available. Please enable at least one dictionary in Dictionary settings.",
};

export function selectionPopupStrings(language: Language): SelectionPopupStrings {
	if (language === "en") {
		return { ...ZH_STRINGS, ...EN_OVERRIDES };
	}
	return ZH_STRINGS;
}
