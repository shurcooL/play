// Learn about a bug in an problematic implementation of isCommitOnlyChange.
package main

import (
	"reflect"

	"github.com/shurcooL/go-goon"
	"sourcegraph.com/sourcegraph/go-sourcegraph/sourcegraph"
	"sourcegraph.com/sqs/pbtypes"
)

func main() {
	a := (sourcegraph.Changeset)(sourcegraph.Changeset{
		ID:          (int64)(123),
		Title:       (string)("title"),
		Description: (string)("desc"),
		Author: (sourcegraph.UserSpec)(sourcegraph.UserSpec{
			Login:  (string)("sh"),
			UID:    (int32)(456),
			Domain: (string)("goo"),
		}),
		DeltaSpec: &sourcegraph.DeltaSpec{
			Base: (sourcegraph.RepoRevSpec)(sourcegraph.RepoRevSpec{
				RepoSpec: (sourcegraph.RepoSpec)(sourcegraph.RepoSpec{
					URI: (string)(""),
				}),
				Rev:      (string)("abc"),
				CommitID: (string)("abc"),
			}),
			Head: (sourcegraph.RepoRevSpec)(sourcegraph.RepoRevSpec{
				RepoSpec: (sourcegraph.RepoSpec)(sourcegraph.RepoSpec{
					URI: (string)(""),
				}),
				Rev:      (string)("cde"),
				CommitID: (string)("cde"),
			}),
		},
		Merged:    (bool)(false),
		CreatedAt: (*pbtypes.Timestamp)(nil),
		ClosedAt:  (*pbtypes.Timestamp)(nil),
	})
	b := (sourcegraph.Changeset)(sourcegraph.Changeset{
		ID:          (int64)(124),
		Title:       (string)("title"),
		Description: (string)("desc"),
		Author: (sourcegraph.UserSpec)(sourcegraph.UserSpec{
			Login:  (string)("sh"),
			UID:    (int32)(456),
			Domain: (string)("goo"),
		}),
		DeltaSpec: &sourcegraph.DeltaSpec{
			Base: (sourcegraph.RepoRevSpec)(sourcegraph.RepoRevSpec{
				RepoSpec: (sourcegraph.RepoSpec)(sourcegraph.RepoSpec{
					URI: (string)(""),
				}),
				Rev:      (string)("xyz"),
				CommitID: (string)("xyz"),
			}),
			Head: (sourcegraph.RepoRevSpec)(sourcegraph.RepoRevSpec{
				RepoSpec: (sourcegraph.RepoSpec)(sourcegraph.RepoSpec{
					URI: (string)(""),
				}),
				Rev:      (string)("rgb"),
				CommitID: (string)("rgb"),
			}),
		},
		Merged:    (bool)(false),
		CreatedAt: (*pbtypes.Timestamp)(nil),
		ClosedAt:  (*pbtypes.Timestamp)(nil),
	})

	goon.DumpExpr(a)

	goon.DumpExpr(isCommitOnlyChange(a, b))

	goon.DumpExpr(a)
}

// isCommitOnlyChange will return true if the difference between the before and
// after Changeset is only in the CommitID's of head and base.
func isCommitOnlyChange(before sourcegraph.Changeset, after sourcegraph.Changeset) bool {
	before.DeltaSpec.Head.CommitID = ""
	before.DeltaSpec.Base.CommitID = ""
	after.DeltaSpec.Head.CommitID = ""
	after.DeltaSpec.Base.CommitID = ""
	return reflect.DeepEqual(before, after)
}
