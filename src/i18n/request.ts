import { getRequestConfig } from "next-intl/server";
import { routing, type AppLocale } from "./routing";
import zh from "../messages/zh.json";
import en from "../messages/en.json";

const messages = { zh, en } as const;

export default getRequestConfig(async ({ requestLocale }) => {
  let locale = await requestLocale;

  if (!locale || !routing.locales.includes(locale as AppLocale)) {
    locale = routing.defaultLocale;
  }

  return {
    locale,
    messages: messages[locale as AppLocale],
  };
});
