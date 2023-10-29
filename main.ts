import { oakCors } from "cors";
import { Application, Request, Router } from "oak";
import { acceptsLanguages } from "std";

class HalLink {
  href: string;
  constructor(uri: string = "") {
    this.href = uri;
  }
}

class AuthorResponseDto {
  _links: Record<string, HalLink> = {};
  description: string;
  name: string;
  constructor(urn: string, name: string, description: string = "") {
    this._links.self = new HalLink(`/authors/${urn}`);
    this.description = description;
    this.name = name;
  }
}

class AuthorsResponseDto {
  _embedded: Record<string, Array<AuthorResponseDto>> = {};
  _links: Record<string, HalLink> = {};
  constructor(authors: Array<AuthorResponseDto> = []) {
    this._embedded.authors = authors;
    this._links.self = new HalLink("/authors");
  }
}

class ProblemDetailsResponseDto {
  status: number;
  title: string;
  type: string;
  constructor(title: string, status = 500, type = "about:blank") {
    this.status = status;
    this.title = title;
    this.type = type;
  }
}

function simplifyLanguages(acceptedLanguages: Array<string>): Array<string> {
  return acceptedLanguages.map((language) => language.substring(0, 2)).reduce(
    function (carry: Array<string>, language) {
      if (!carry.includes(language)) carry.push(language);
      return carry;
    },
    [],
  );
}

function selectLanguage(a: Record<string, string>, request: Request): string {
  for (const language of simplifyLanguages(acceptsLanguages(request))) {
    if (a[language] !== undefined) {
      return language;
    }
  }

  return "en";
}

const router = new Router();
router
  .get("/", (context) => {
    context.response.body = {
      _links: {
        self: {
          href: "/",
        },
        authors: {
          href: "/authors",
        },
      },
    };
    context.response.type = "application/hal+json";
  })
  .get("/authors", async (context) => {
    const query = context.request.url.searchParams.get("q") ?? "";
    const inventaireResponse = await fetch(
      `https://inventaire.io/api/search?types=humans&search=${query}&lang=en&limit=100&offset=10&exact=true`,
    );
    const inventaireResults = await inventaireResponse.json();
    console.log(inventaireResults);
    const inventaireAuthors = inventaireResults?.results as Array<
      Record<string, string | number | Array<string>>
    >;
    context.response.body = new AuthorsResponseDto(
      inventaireAuthors.map((author) =>
        new AuthorResponseDto(
          "" + author.uri,
          "" + author.label,
          "" + author.description,
        )
      ),
    );
    context.response.type = "application/hal+json";
  })
  .get("/authors/:urn", async (context) => {
    if (context?.params?.urn) {
      const inventaireResponse = await fetch(
        `https://inventaire.io/api/entities?action=by-uris&uris=${context?.params?.urn}`,
      );
      const inventaireResults = await inventaireResponse.json();
      
      if (inventaireResults?.notFound !== undefined) {
        const status = 404;
        context.response.body = new ProblemDetailsResponseDto("Not Found", status);
        context.response.status = status;
        context.response.type = "application/problem+json";
        return;
      }
      const language = selectLanguage(inventaireResults.entities[context?.params?.urn]?.labels, context.request);
      context.response.body = new AuthorResponseDto(context?.params?.urn, inventaireResults.entities[context?.params?.urn]?.labels[language], inventaireResults.entities[context?.params?.urn]?.descriptions[language]);
      context.response.type = "application/hal+json";
    }
  });

const app = new Application();
app.use(oakCors()); // Enable CORS for All Routes
app.use(router.routes());
app.use(router.allowedMethods());

await app.listen({ port: 8000 });
