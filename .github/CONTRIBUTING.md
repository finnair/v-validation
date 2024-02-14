# Contributing

- All commits must be signed-off
- Please follow [Conventional Commits](https://www.conventionalcommits.org/en/v1.0.0/) guidelines

## Requirements

- node (tested with 12.x, 14.x, 16.x, and 18.x)
- typescript (tested with 4.5.x)
- yarn (tested with 1.22.10)
- lerna (tested 8.1.2)
- jest (tested with 27.4.7)

## Commands

1. Install depencencies with Lerna v7+ (automatic in DevContainer)

```shell
yarn install
```

2. Build with

```shell
yarn build
```

3. Test with

```shell
yarn test
# or with coverage
jest --coverage
```

4. Clean dependencies and built files

```shell
yarn clean
```

## Publishing

Make sure that git remote origin points to `git@github.com:finnair/v-validation.git`.

Publishing uses [@lerna/version](https://github.com/lerna/lerna/tree/master/commands/version) and [@lerna/publish](https://github.com/lerna/lerna/tree/master/commands/publish).

Publishing requires npm credentials with access to `finnair` organization and `GH_TOKEN` environment variable, i.e. your GitHub authentication token for `public_repo` scope (under Settings > Developer settings > Personal access tokens).

```shell
./publish.sh [patch|minor|major]
```

After publishing to NPM, check/update CHANGELOG.md files and draft a Github Release manually.
