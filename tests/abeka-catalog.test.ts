import { test } from "node:test";
import assert from "node:assert/strict";
import {
  parseCatalogGroups,
  parseCatalogGrades,
  parseCatalogSubjects,
  mergeCatalogSubjects,
} from "../lib/abeka/catalog";
import { abekaClient } from "../lib/abeka/report";

test("catalog uses provider IDs, includes unchecked subjects and does not confuse permissions with progress", () => {
  const result = parseCatalogSubjects(
    JSON.stringify({
      d: {
        Subjects: [
          {
            SubjectId: 5298,
            SubjectName: "English 12",
            TotalLessons: 170,
            Checked: false,
            LessonCount: 0,
            Percentage: 0,
          },
          {
            SubjectId: 12314,
            SubjectName: "Economics ",
            TotalLessons: 85,
            Checked: false,
          },
          {
            SubjectId: 45291,
            SubjectName: "Activities 5",
            FirstLesson: 2,
            LastLesson: 167,
            TotalLessons: 34,
            Checked: true,
          },
        ],
      },
    }),
  );
  assert.deepEqual(result, [
    { subjectId: "5298", name: "English 12", totalLessons: 170 },
    { subjectId: "12314", name: "Economics", totalLessons: 85 },
    { subjectId: "45291", name: "Activities 5", totalLessons: 34 },
  ]);
  assert.deepEqual(mergeCatalogSubjects([...result, ...result]), result);
  assert.throws(() =>
    mergeCatalogSubjects([...result, { ...result[0], totalLessons: 85 }]),
  );
  assert.deepEqual(
    parseCatalogGrades(
      '{"d":{"Grades":[{"GradeCode":12,"Checked":false},{"GradeCode":16}]}}',
    ),
    ["12", "16"],
  );
  for (const body of [
    "{}",
    "<html>login</html>",
    '{"d":{"Subjects":[{"SubjectId":1,"SubjectName":"X","TotalLessons":-1}]}}',
  ])
    assert.throws(() => parseCatalogSubjects(body));
});

test("catalog page validates institutional scope and refuses an unobserved multi-subscription flow", async () => {
  const html = `<select id="ddlSchools"><option selected value="123">School</option></select><select id="ddlSubscriptions"><option value="4">ProTeach</option></select><a onclick='editPermissions("17", "North");'>Permissions</a>`;
  assert.deepEqual(parseCatalogGroups(html), {
    schoolId: "123",
    groups: ["17"],
  });
  assert.throws(() =>
    parseCatalogGroups(
      html
        .replace('value="4"', 'value="4"')
        .replace("</select><a", '<option value="5">Other</option></select><a'),
    ),
  );
  assert.throws(() => parseCatalogGroups("<html>Login</html>"));
  const requests: { url: string; body?: string }[] = [];
  const client = abekaClient("session=test", async (url, init) => {
    requests.push({ url: String(url), body: init?.body as string });
    return new Response(
      String(url).endsWith("GetGroupGrades")
        ? '{"d":{"Grades":[{"GradeCode":12}]}}'
        : '{"d":{"Subjects":[{"SubjectId":5298,"SubjectName":"English 12","TotalLessons":170}]}}',
      { headers: { "content-type": "application/json" } },
    );
  });
  await client.catalogGrades("17");
  await client.catalogSubjects("17", "12");
  assert.deepEqual(
    requests.map((r) => JSON.parse(r.body!)),
    [{ GroupID: "17" }, { GroupID: "17", grade: "12" }],
  );
  assert.ok(requests.every((r) => /\/GetGroup(Grades|Subjects)$/.test(r.url)));
  await assert.rejects(client.catalogSubjects("17", "../../"));
  assert.equal(requests.length, 2);
});
