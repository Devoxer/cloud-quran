import { i } from '@instantdb/react-native';

const _schema = i.schema({
  entities: {
    readingPosition: i.entity({
      surah: i.number().indexed(),
      verse: i.number(),
      page: i.number(),
      mode: i.string(), // "reading" | "mushaf"
      updatedAt: i.date().indexed(),
    }),
    bookmarks: i.entity({
      surah: i.number().indexed(),
      verse: i.number().indexed(),
      label: i.string().optional(),
      createdAt: i.date().indexed(),
    }),
    preferences: i.entity({
      theme: i.string(), // "light" | "sepia" | "dark"
      fontSize: i.number(), // 20-44
      reciterId: i.string(),
      readingMode: i.string(), // "reading" | "mushaf"
      translationId: i.string().optional(),
      speedRate: i.number(), // 0.5-2.0
      transliteration: i.boolean(),
    }),
    audioPosition: i.entity({
      surah: i.number().indexed(),
      verse: i.number(),
      reciterId: i.string(),
      updatedAt: i.date().indexed(),
    }),
  },
  links: {},
});

type _AppSchema = typeof _schema;
interface AppSchema extends _AppSchema {}
const schema: AppSchema = _schema;
export type { AppSchema };
export default schema;
