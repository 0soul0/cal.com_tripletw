import { withAppDirSsr } from "app/WithAppDirSsr";
import type { PageProps } from "app/_types";
import { generateMeetingMetadata } from "app/_utils";
import { headers, cookies } from "next/headers";

import { getOrgFullOrigin } from "@calcom/features/ee/organizations/lib/orgDomains";

import { buildLegacyCtx, decodeParams } from "@lib/buildLegacyCtx";

import { getServerSideProps } from "@server/lib/[user]/getServerSideProps";

import type { PageProps as LegacyPageProps } from "~/users/views/users-public-view";
import LegacyPage from "~/users/views/users-public-view";

export const generateMetadata = async ({ params, searchParams }: PageProps) => {
  const decodedParams = decodeParams(await params);
  const searchParamsValue = await searchParams;
  const searchParamsString = new URLSearchParams(searchParamsValue as any).toString();
  const userPath = Array.isArray(decodedParams.user) ? decodedParams.user.join("+") : decodedParams.user;
  const currentUrl = `/${userPath}${searchParamsString ? `?${searchParamsString}` : ""}`;
  const legacyCtx = buildLegacyCtx(await headers(), await cookies(), await params, searchParamsValue, currentUrl);
  const props = await getData(legacyCtx);

  const { profile, markdownStrippedBio, isOrgSEOIndexable, entity } = props;
  const isOrg = !!profile?.organization;
  const allowSEOIndexing =
    (!isOrg && profile.allowSEOIndexing) || (isOrg && isOrgSEOIndexable && profile.allowSEOIndexing);

  const meeting = {
    title: markdownStrippedBio,
    profile: { name: `${profile.name}`, image: profile.image },
    users: [{ username: `${profile.username}`, name: `${profile.name}` }],
  };
  const metadata = await generateMeetingMetadata(
    meeting,
    () => profile.name,
    () => markdownStrippedBio,
    false,
    getOrgFullOrigin(entity.orgSlug ?? null),
    `/${decodeParams(await params).user}`
  );

  return {
    ...metadata,
    robots: {
      follow: allowSEOIndexing,
      index: allowSEOIndexing,
    },
  };
};

const getData = withAppDirSsr<LegacyPageProps>(getServerSideProps);
const ServerPage = async ({ params, searchParams }: PageProps) => {
  const decodedParams = decodeParams(await params);
  const searchParamsValue = await searchParams;
  const searchParamsString = new URLSearchParams(searchParamsValue as any).toString();
  const userPath = Array.isArray(decodedParams.user) ? decodedParams.user.join("+") : decodedParams.user;
  const currentUrl = `/${userPath}${searchParamsString ? `?${searchParamsString}` : ""}`;
  const legacyCtx = buildLegacyCtx(await headers(), await cookies(), await params, searchParamsValue, currentUrl);
  const props = await getData(legacyCtx);

  return <LegacyPage {...props} />;
};

export default ServerPage;
