export const PRIMARY_WORKSPACE_ITEMS = [
    {
        id: 'editor',
        section: 'Story Workspace',
        label: 'Editor',
        eyebrow: 'Timeline',
        description: 'Arrange the story spine, overlays, and interactions in one studio view.'
    },
    {
        id: 'upload',
        section: 'Story Workspace',
        label: 'Media',
        eyebrow: 'Ingest',
        description: 'Bring source footage and audio into the project.'
    },
    {
        id: 'clipper',
        section: 'Story Workspace',
        label: 'Scenes',
        eyebrow: 'Edit',
        description: 'Cut playable scenes from your source footage.'
    },
    {
        id: 'logic',
        section: 'Story Workspace',
        label: 'Branches',
        eyebrow: 'Logic',
        description: 'Author choices, detours, variables, and endings.'
    },
    {
        id: 'publish',
        section: 'Story Workspace',
        label: 'Publish',
        eyebrow: 'Player',
        description: 'Sequence scenes, preview the movie, and export builds.'
    }
];

export const SECONDARY_WORKSPACE_ITEMS = [
    {
        id: 'library',
        section: 'Project Tools',
        label: 'Library',
        eyebrow: 'Manage',
        description: 'Rename scenes, set endings, and manage thumbnails.'
    },
    {
        id: 'eventCreator',
        section: 'Project Tools',
        label: 'Events',
        eyebrow: 'Choices',
        description: 'Generate event scenes and test branch clips quickly.'
    },
    {
        id: 'stats',
        section: 'Project Tools',
        label: 'Analytics',
        eyebrow: 'Telemetry',
        description: 'Inspect how choices are performing.'
    },
    {
        id: 'achievements',
        section: 'Project Tools',
        label: 'Rewards',
        eyebrow: 'Meta',
        description: 'Manage achievements and progression unlocks.'
    }
];

export const WORKSPACE_VIEW_GROUPS = {
    editor: ['editor'],
    upload: ['upload', 'library'],
    clipper: ['clipper'],
    logic: ['logic', 'eventCreator'],
    publish: ['publish', 'stats', 'achievements']
};

export function getWorkspaceItem(viewId) {
    return [...PRIMARY_WORKSPACE_ITEMS, ...SECONDARY_WORKSPACE_ITEMS].find((item) => item.id === viewId) || null;
}

export function getWorkspaceGroup(viewId) {
    return Object.entries(WORKSPACE_VIEW_GROUPS).find(([, views]) => views.includes(viewId))?.[0] || viewId;
}
