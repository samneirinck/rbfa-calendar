import { WorkerEntrypoint } from "cloudflare:workers";

interface MatchDetail {
  readonly id: string;
  readonly startTime: string;
  readonly channel: string;
  readonly homeTeam: MatchDetailTeam;
  readonly awayTeam: MatchDetailTeam;
  readonly outcome: MatchDetailOutcome;
  readonly series: MatchSeries;
  readonly officials: MatchDetailOfficial[];
  readonly showScore: boolean;
  readonly state: string;
  readonly startDateTimeInThePassed: boolean;
  readonly ageGroup: string;
}

interface MatchDetailWithLocation extends MatchDetail {
  readonly location: MatchLocation;
}

interface MatchLocation {
  readonly id: string;
  readonly name: string;
  readonly city: string;
  readonly postalCode: string;
  readonly address: string;
  readonly pitchCode: string;
  readonly synthetic: boolean;
}

interface MatchDetailTeam {
  readonly id: string;
  readonly name: string;
  readonly clubId: string;
  readonly logo: string;
}

interface MatchDetailOutcome {
  readonly status: string;
  readonly homeTeamGoals: number;
  readonly awayTeamGoals: number;
}

interface MatchDetailOfficial {
  readonly lastName: string;
  readonly firstName: string;
  readonly status: string;
  readonly personAssigned: boolean;
}

interface MatchSeries {
  readonly id: string;
  readonly name: string;
}
interface TeamCalendarResponse {
  readonly data: {
    readonly teamCalendar: MatchDetail[];
  };
}

interface MatchDetailResponse {
  readonly data: {
    readonly matchDetail: MatchDetailWithLocation;
  };
}

function parsePathParam(request: Request): Response | number {
  const url = new URL(request.url);
  const id = parseInt(url.pathname.substring(1), 10);
  if (!id) {
    return new Response("Not found", {
      status: 404,
    });
  }
  return id;
}

async function graphql<T>(body: any): Promise<T> {
  const response = await fetch("https://datalake-prod2018.rbfa.be/graphql", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  return response.json() as T;
}
export class MatchDetails extends WorkerEntrypoint {
  async fetch(request: Request): Promise<Response> {
    const matchId = parsePathParam(request);

    const matchDetails = await graphql<MatchDetailResponse>({
      operationName: "GetMatchDetail",
      variables: {
        matchId,
        language: "nl",
      },
      extensions: {
        persistedQuery: {
          version: 1,
          sha256Hash:
            "cd8867b845c206fe7aa75c1ebf7b53cbda0ff030253a45e2e2b4bcc13ee46c9a",
        },
      },
    });
    return new Response(
      JSON.stringify(matchDetails.data.matchDetail.location),
      {
        headers: {
          "Cache-Control": `public, max-age=${7 * 24 * 60 * 60}`,
        },
      },
    );
  }
}

export default {
  async fetch(request: Request, env, ctx): Promise<Response> {
    const url = new URL(request.url);
    const teamId = parsePathParam(request);
    // Fetch cal info for team

    const headers = new Headers();
    headers.set("Content-Type", "text/calendar");
    headers.set("Cache-Control", `public, max-age=${60 * 60}`);

    const teamCalendar = await graphql<TeamCalendarResponse>({
      operationName: "GetTeamCalendar",
      variables: {
        teamId,
        language: "nl",
        sortByDate: "asc",
      },
      extensions: {
        persistedQuery: {
          version: 1,
          sha256Hash:
            "3f0441e6723b9852b4f0cff2c872f4aa674c5de2d23589efc70c7a4ffb7f6383",
        },
      },
    });

    const lines = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:RBFACALSYNC"];

    function toDtString(date: Date) {
      return `${date.toISOString().replaceAll("-", "").replaceAll(":", "").split(".")[0]}`;
    }
    const escapeText = (s) =>
      s
        .replace(/\\/g, "\\\\")
        .replace(/;/g, "\\;")
        .replace(/,/g, "\\,")
        .replace(/\r?\n/g, "\\n");

    function foldLine(rawLine: string) {
      const line = escapeText(rawLine);
      const MAX = 75;
      let result = "";
      let count = 0;

      for (const char of line) {
        // Octets, not characters: UTF-8 chars can be 1–4 bytes
        const octets =
          char.charCodeAt(0) < 128 ? 1 : new TextEncoder().encode(char).length;

        if (count + octets > MAX) {
          result += "\r\n "; // fold: CRLF + single space
          count = 1; // the leading space counts as 1 octet
        }
        result += char;
        count += octets;
      }
      return result;
    }

    for (const match of teamCalendar.data.teamCalendar) {
      const start = new Date(match.startTime);
      const end = new Date(start.getTime() + 2 * 60 * 60 * 1000);
      const teamLocationRequest = new Request(
        `${url.protocol}//${url.hostname}:${url.port}/${match.id}`,
      );

      const locationResponse =
        await ctx.exports.MatchDetails.fetch(teamLocationRequest);
      const location = (await locationResponse.json()) as MatchLocation;
      lines.push("BEGIN:VEVENT");
      lines.push(`UID:${match.id}`);
      lines.push("DTSTAMP:20260101T120000");
      lines.push(`DTSTART:${toDtString(start)}`);
      lines.push(`DTEND:${toDtString(end)}`);
      lines.push(`SUMMARY:${match.homeTeam.name} - ${match.awayTeam.name}`);
      lines.push(`DESCRIPTION:${match.series.name}`);
      lines.push(
        foldLine(
          `LOCATION:${location.address}, ${location.postalCode} ${location.city}`,
        ),
      );
      lines.push(`URL:https://www.rbfa.be/nl/wedstrijd/${match.id}`);
      lines.push("END:VEVENT");
    }

    lines.push("END:VCALENDAR");

    return new Response(lines.join("\r\n"), {
      headers,
    });
  },
} satisfies ExportedHandler<Env>;
