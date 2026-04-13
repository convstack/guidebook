import { createSelfRegister } from "@convstack/service-sdk/registration";
import { GUIDEBOOK_MANIFEST } from "~/lib/manifest";

export const registerGuidebook = createSelfRegister(GUIDEBOOK_MANIFEST);
