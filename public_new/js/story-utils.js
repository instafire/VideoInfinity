export const DEFAULT_CHOICE = Object.freeze({
    toId: null,
    label: '',
    color: '#ffffff',
    return: false,
    returnToMain: false,
    setVar: '',
    reqVar: '',
    timeoutSeconds: 0,
    timeoutToId: null,
    isDeadEnd: false,
    behaviorType: 'menu',
    qteDuration: 0,
    qteTargetId: '',
    characterName: '',
    relationshipChange: 0,
    achievementId: '',
    isHidden: false,
    overlayMode: 'card',
    overlayAsset: '',
    overlayX: 50,
    overlayY: 50,
    overlayWidth: 22,
    overlayHeight: 18,
    overlayFit: 'cover',
    overlayFocusX: 50,
    overlayFocusY: 50
});

export function createChoice(overrides = {}) {
    return {
        ...DEFAULT_CHOICE,
        ...overrides
    };
}

export function createChoiceBlock(triggerTime = 0) {
    return {
        id: null,
        triggerTime,
        behaviorType: 'menu',
        timeoutSeconds: 0,
        timeoutToId: null,
        choices: [createChoice(), createChoice()]
    };
}

export function groupEdgesIntoBlocks(edges, fromId, options = {}) {
    const relevantEdges = edges.filter((edge) => edge.from_id === fromId);
    const blocks = {};

    relevantEdges.forEach((edge) => {
        const blockId = edge.logic_id || `legacy_${edge.trigger_time}`;
        if (!blocks[blockId]) {
            blocks[blockId] = {
                id: blockId,
                triggerTime: edge.trigger_time,
                behaviorType: edge.behavior_type || 'menu',
                timeoutSeconds: edge.timeout_seconds || 0,
                timeoutToId: edge.timeout_to_id || null,
                choices: []
            };
        }

        blocks[blockId].choices.push(createChoice({
            toId: edge.to_id,
            label: edge.label,
            color: edge.text_color || '#ffffff',
            return: !!edge.return_to_main,
            returnToMain: !!edge.return_to_main,
            setVar: edge.set_var || '',
            reqVar: edge.req_var || '',
            timeoutSeconds: edge.timeout_seconds || 0,
            timeoutToId: edge.timeout_to_id || null,
            isDeadEnd: !!edge.is_dead_end,
            behaviorType: edge.behavior_type || 'menu',
            qteDuration: edge.qte_duration || 0,
            qteTargetId: edge.qte_target_id || '',
            characterName: edge.character_name || '',
            relationshipChange: edge.relationship_change || 0,
            achievementId: edge.achievement_id || '',
            isHidden: !!edge.is_hidden,
            overlayMode: edge.overlay_mode || 'card',
            overlayAsset: edge.overlay_asset || '',
            overlayX: edge.overlay_x ?? 50,
            overlayY: edge.overlay_y ?? 50,
            overlayWidth: edge.overlay_width ?? 22,
            overlayHeight: edge.overlay_height ?? 18,
            overlayFit: edge.overlay_fit || 'cover',
            overlayFocusX: edge.overlay_focus_x ?? 50,
            overlayFocusY: edge.overlay_focus_y ?? 50
        }));
    });

    const blockList = Object.values(blocks)
        .map((block) => ({
            ...block,
            choices: block.choices.length ? block.choices : [createChoice()]
        }))
        .sort((a, b) => a.triggerTime - b.triggerTime);

    if (options.forPreview) {
        return blockList.map((block) => ({
            id: block.id,
            time: block.triggerTime,
            behaviorType: block.behaviorType,
            timeoutSeconds: block.timeoutSeconds,
            timeoutToId: block.timeoutToId,
            choices: block.choices.map((choice) => ({
                to: choice.toId,
                label: choice.label,
                color: choice.color,
                setVar: choice.setVar,
                reqVar: choice.reqVar,
                return: choice.return,
                timeoutSeconds: choice.timeoutSeconds,
                timeoutToId: choice.timeoutToId,
                isDeadEnd: choice.isDeadEnd,
                behaviorType: choice.behaviorType,
                qteDuration: choice.qteDuration,
                qteTargetId: choice.qteTargetId,
                characterName: choice.characterName,
                relationshipChange: choice.relationshipChange,
                achievementId: choice.achievementId,
                isHidden: choice.isHidden,
                overlayMode: choice.overlayMode || 'card',
                overlayAsset: choice.overlayAsset || '',
                overlayX: choice.overlayX ?? 50,
                overlayY: choice.overlayY ?? 50,
                overlayWidth: choice.overlayWidth ?? 22,
                overlayHeight: choice.overlayHeight ?? 18,
                overlayFit: choice.overlayFit || 'cover',
                overlayFocusX: choice.overlayFocusX ?? 50,
                overlayFocusY: choice.overlayFocusY ?? 50
            }))
        }));
    }

    return blockList;
}

export function serializeBlockChoices(block) {
    return block.choices.map((choice) => ({
        ...choice,
        timeoutSeconds: block.timeoutSeconds || 0,
        timeoutToId: block.timeoutToId || null,
        behaviorType: block.behaviorType || 'menu'
    }));
}

export function nextPreviewBlock(activeBlocks, currentTime, windowSeconds = 1.0) {
    while (activeBlocks.length && currentTime > activeBlocks[0].time + windowSeconds) {
        activeBlocks.shift();
    }
    return activeBlocks[0] || null;
}

export function formatClock(seconds) {
    if (!seconds) return '0:00';
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
}
