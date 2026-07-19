import { createUploadthing, type FileRouter } from "uploadthing/next";
import { getSessionUser } from "@/lib/server/auth";

const f = createUploadthing();

export const ourFileRouter = {
  documentUpload: f({
    image: { maxFileSize: "8MB", maxFileCount: 5 },
    pdf: { maxFileSize: "16MB", maxFileCount: 5 },
  })
    .middleware(async () => {
      const user = await getSessionUser();
      if (!user) throw new Error("Não autenticado");
      return { userId: user.id, userName: user.name };
    })
    .onUploadComplete(async ({ metadata, file }) => {
      return { uploadedBy: metadata.userId, url: file.url };
    }),
} satisfies FileRouter;

export type OurFileRouter = typeof ourFileRouter;
