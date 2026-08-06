const entityPerms = {
  allow: {
    view: 'isOwner || isGuestOwner',
    create: 'isOwner',
    update: 'isOwner || isGuestOwner',
    delete: 'isOwner',
  },
  bind: [
    'isOwner',
    'auth.id == data.creator',
    'isGuestOwner',
    "data.creator in auth.ref('$user.linkedGuestUsers.id')",
  ],
};

export default {
  readingPosition: entityPerms,
  bookmarks: entityPerms,
  preferences: entityPerms,
  audioPosition: entityPerms,
};
