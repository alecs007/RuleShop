/**
 * Creeaza (sau reseteaza parola pentru) un administrator de magazin.
 *
 *   pnpm create-admin --email admin@ruleshop.dev --password "..." \
 *     [--name "Nume"] [--store ruleshop-ro] [--role STORE_ADMIN|PLATFORM_ADMIN|OPERATOR]
 *
 * Daca --password lipseste, se genereaza una aleatorie si se afiseaza o
 * singura data. Parola se stocheaza doar ca hash bcrypt.
 */
import { PrismaClient, Role } from "@prisma/client";
import { hash } from "bcryptjs";
import { randomBytes } from "crypto";

const prisma = new PrismaClient();

function getArg(name: string): string | undefined {
  const idx = process.argv.indexOf(`--${name}`);
  if (idx === -1) return undefined;
  return process.argv[idx + 1];
}

async function main() {
  const email = getArg("email")?.trim().toLowerCase();
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    console.error("Eroare: --email valid este obligatoriu.");
    process.exit(1);
  }

  const roleArg = (getArg("role") ?? "STORE_ADMIN").toUpperCase();
  if (!["STORE_ADMIN", "PLATFORM_ADMIN", "OPERATOR"].includes(roleArg)) {
    console.error("Eroare: --role trebuie sa fie STORE_ADMIN, PLATFORM_ADMIN sau OPERATOR.");
    process.exit(1);
  }
  const role = roleArg as Role;

  let password = getArg("password");
  let generated = false;
  if (!password) {
    password = randomBytes(12).toString("base64url");
    generated = true;
  }
  if (password.length < 10) {
    console.error("Eroare: parola trebuie sa aiba minim 10 caractere.");
    process.exit(1);
  }

  // PLATFORM_ADMIN este cont global; restul apartin unui magazin.
  let storeId: string | null = null;
  if (role !== "PLATFORM_ADMIN") {
    const storeSlug = getArg("store") ?? process.env.DEFAULT_STORE_SLUG ?? "ruleshop-ro";
    const store = await prisma.store.findUnique({ where: { slug: storeSlug } });
    if (!store) {
      console.error(`Eroare: magazinul "${storeSlug}" nu exista. Ruleaza intai pnpm db:seed.`);
      process.exit(1);
    }
    storeId = store.id;
  }

  const passwordHash = await hash(password, 12);
  const name = getArg("name") ?? "Administrator";

  const user = await prisma.user.upsert({
    where: { email },
    create: { email, name, passwordHash, role, storeId, emailVerified: new Date() },
    update: { passwordHash, role, storeId, active: true },
  });

  console.log("✔ Administrator pregatit:");
  console.log(`   email:   ${user.email}`);
  console.log(`   rol:     ${user.role}`);
  console.log(`   magazin: ${storeId ?? "(global)"}`);
  if (generated) {
    console.log(`   parola:  ${password}   <- noteaz-o, nu va mai fi afisata`);
  }
  console.log("   login:   http://localhost:3000/auth/admin");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
