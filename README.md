Welcome to your new TanStack Start app!

# Getting Started

To run this application:

```bash
pnpm install
pnpm dev
```

# Architecture

Hexagonal (ports & adapters), sliced by feature — backend and frontend side by side:

```
src/
  app/                    composition root (runtime.ts wires every port to its adapter) + app shell
  features/<feature>/     auth · organizations · members · groups · songs · playlists · sharing
    domain/               pure rules, entities, schemas — no I/O, no framework
    application/          ports (Effect Context.Tag) + use cases (authorization lives here)
    infrastructure/       adapters: Drizzle repositories + this feature's tables, Better Auth, …
    server/               server functions: decode input → resolve actor → run a use case
    ui/                   pages, components, query keys/options (TanStack Query)
  shared/                 kernel used by every feature (errors, pagination, FileStorage port + S3
                          adapter, db client, UI primitives, form, hooks)
  routes/                 TanStack Router file routes — config only (search, loader, head), pages come from features
```

Dependencies point inwards: `ui → server → application → domain`, `infrastructure → application/domain`.
A feature may use another feature's domain or application (e.g. playlists check songs through
`SongRepository`), never its adapters. `src/architecture.test.ts` enforces these rules.

**Reads** (UI): `queryOptions` per resource in `features/*/ui/queries.ts` (keys in `ui/keys.ts`). Route loaders
call `context.queryClient.ensureQueryData(...)`; components read the same options with `useSuspenseQuery`
(or `useQuery` + `keepPreviousData` for in-component search/paging).

**Writes** (UI): `useMutation` calling the server function, with `meta: { invalidates: [someKeys.all], errorMessage: '…' }` —
the global `MutationCache` (`shared/ui/lib/query-client.ts`) refetches those keys before `mutateAsync` resolves and
toasts the message on failure. Forms omit `errorMessage` and show `mutation.isError` inline instead.

The `QueryClient` is created per router (so per request during SSR) and wired with `setupRouterSsrQueryIntegration`;
switching choir clears the whole cache.

# Testing

```bash
pnpm test        # unit tests (Vitest) — use cases run on the real Drizzle adapters over in-process Postgres (PGlite)
pnpm test:e2e    # end-to-end (Playwright) — needs `docker compose up -d`
```

E2E tests start the app on port 3100 against a dedicated `chorale_e2e` database, recreated and seeded with a
director account on every run (see `e2e/global-setup.ts`). Your dev database is never touched.
First run: `pnpm exec playwright install chromium`.

# Building For Production

To build this application for production:

```bash
pnpm build
```

## Styling

This project uses [Tailwind CSS](https://tailwindcss.com/) for styling.

### Removing Tailwind CSS

If you prefer not to use Tailwind CSS:

1. Remove the demo pages in `src/routes/demo/`
2. Replace the Tailwind import in `src/styles.css` with your own styles
3. Remove `tailwindcss()` from the plugins array in `vite.config.ts`
4. Remove `@tailwindcss/vite` and `tailwindcss` from `package.json`



## Routing

This project uses [TanStack Router](https://tanstack.com/router) with file-based routing. Routes are managed as files in `src/routes`.

### Adding A Route

To add a new route to your application just add a new file in the `./src/routes` directory.

TanStack will automatically generate the content of the route file for you.

Now that you have two routes you can use a `Link` component to navigate between them.

### Adding Links

To use SPA (Single Page Application) navigation you will need to import the `Link` component from `@tanstack/react-router`.

```tsx
import { Link } from "@tanstack/react-router";
```

Then anywhere in your JSX you can use it like so:

```tsx
<Link to="/about">About</Link>
```

This will create a link that will navigate to the `/about` route.

More information on the `Link` component can be found in the [Link documentation](https://tanstack.com/router/v1/docs/framework/react/api/router/linkComponent).

### Using A Layout

In the File Based Routing setup the layout is located in `src/routes/__root.tsx`. Anything you add to the root route will appear in all the routes. The route content will appear in the JSX where you render `{children}` in the `shellComponent`.

Here is an example layout that includes a header:

```tsx
import { HeadContent, Scripts, createRootRoute } from '@tanstack/react-router'

export const Route = createRootRoute({
  head: () => ({
    meta: [
      { charSet: 'utf-8' },
      { name: 'viewport', content: 'width=device-width, initial-scale=1' },
      { title: 'My App' },
    ],
  }),
  shellComponent: ({ children }) => (
    <html lang="en">
      <head>
        <HeadContent />
      </head>
      <body>
        <header>
          <nav>
            <Link to="/">Home</Link>
            <Link to="/about">About</Link>
          </nav>
        </header>
        {children}
        <Scripts />
      </body>
    </html>
  ),
})
```

More information on layouts can be found in the [Layouts documentation](https://tanstack.com/router/latest/docs/framework/react/guide/routing-concepts#layouts).

## Server Functions

TanStack Start provides server functions that allow you to write server-side code that seamlessly integrates with your client components.

```tsx
import { createServerFn } from '@tanstack/react-start'

const getServerTime = createServerFn({
  method: 'GET',
}).handler(async () => {
  return new Date().toISOString()
})

// Use in a component
function MyComponent() {
  const [time, setTime] = useState('')
  
  useEffect(() => {
    getServerTime().then(setTime)
  }, [])
  
  return <div>Server time: {time}</div>
}
```

## API Routes

You can create API routes by using the `server` property in your route definitions:

```tsx
import { createFileRoute } from '@tanstack/react-router'
import { json } from '@tanstack/react-start'

export const Route = createFileRoute('/api/hello')({
  server: {
    handlers: {
      GET: () => json({ message: 'Hello, World!' }),
    },
  },
})
```

## Data Fetching

There are multiple ways to fetch data in your application. You can use TanStack Query to fetch data from a server. But you can also use the `loader` functionality built into TanStack Router to load the data for a route before it's rendered.

For example:

```tsx
import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/people')({
  loader: async () => {
    const response = await fetch('https://swapi.dev/api/people')
    return response.json()
  },
  component: PeopleComponent,
})

function PeopleComponent() {
  const data = Route.useLoaderData()
  return (
    <ul>
      {data.results.map((person) => (
        <li key={person.name}>{person.name}</li>
      ))}
    </ul>
  )
}
```

Loaders simplify your data fetching logic dramatically. Check out more information in the [Loader documentation](https://tanstack.com/router/latest/docs/framework/react/guide/data-loading#loader-parameters).



# Learn More

You can learn more about all of the offerings from TanStack in the [TanStack documentation](https://tanstack.com).

For TanStack Start specific documentation, visit [TanStack Start](https://tanstack.com/start).
