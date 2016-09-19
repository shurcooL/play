// Display a code diff with single-line JSON diffs expanded/indented for easier readability.
package main

import (
	"bytes"
	"encoding/json"
	"io/ioutil"
	"os"
	"os/exec"
	"strings"

	"github.com/shurcooL/go/openutil"
	"sourcegraph.com/sourcegraph/go-diff/diff"
)

func main() {
	allJSON := false

	var b string

	/*allJSON = true
	cmd := exec.Command("git", "diff")
	cmd.Dir = "/Users/Dmitri/Dropbox/Store/issues"
	in, err := cmd.Output()
	if err != nil {
		panic(err)
	}*/

	fileDiffs, err := diff.ParseMultiFileDiff([]byte(in))
	if err != nil {
		panic(err)
	}

	for _, fileDiff := range fileDiffs {
		b += "\n" + "## " + fileDiffName(fileDiff) + "\n"
		b += "\n```diff\n"
		if !strings.HasSuffix(fileDiffName(fileDiff), ".json") && !allJSON {
			hunks, err := diff.PrintHunks(fileDiff.Hunks)
			if err != nil {
				panic(err)
			}
			b += string(hunks)
		} else {
			lines := strings.Split(string(fileDiff.Hunks[0].Body), "\n")
			var d [2][]byte

			for _, n := range [...]struct {
				int
				string
			}{{0, "-"}, {1, "+"}} {
				var out bytes.Buffer
				err := json.Indent(&out, []byte(lines[n.int][1:]), "", "\t")
				if err != nil {
					panic(err)
				}

				/*lines2 := strings.Split(out.String(), "\n")
				for _, line := range lines2 {
					b += n.string + line + "\n"
				}*/
				d[n.int] = out.Bytes()
			}

			ud, err := unifiedDiff(d[0], d[1])
			if err != nil {
				panic(err)
			}

			b += string(ud)
		}
		b += "```\n"
	}

	openutil.DisplayMarkdownInBrowser([]byte(b))
}

// fileDiffName returns the name of a FileDiff as Markdown.
func fileDiffName(fileDiff *diff.FileDiff) string {
	origName := strings.TrimPrefix(fileDiff.OrigName, "a/")
	newName := strings.TrimPrefix(fileDiff.NewName, "b/")
	switch {
	case origName != "/dev/null" && newName != "/dev/null" && origName == newName: // Modified.
		return newName
	case origName != "/dev/null" && newName != "/dev/null" && origName != newName: // Renamed.
		return origName + " -> " + newName
	case origName == "/dev/null" && newName != "/dev/null": // Added.
		return newName
	case origName != "/dev/null" && newName == "/dev/null": // Removed.
		return "~~" + origName + "~~"
	default:
		panic("unexpected *diff.FileDiff, no names")
	}
}

func unifiedDiff(b0, b1 []byte) (data []byte, err error) {
	f0, err := ioutil.TempFile("", "diff")
	if err != nil {
		return
	}
	defer os.Remove(f0.Name())
	defer f0.Close()

	f1, err := ioutil.TempFile("", "diff")
	if err != nil {
		return
	}
	defer os.Remove(f1.Name())
	defer f1.Close()

	f0.Write(b0)
	f1.Write(b1)

	data, err = exec.Command("diff", "-u", f0.Name(), f1.Name()).CombinedOutput()
	if len(data) > 0 {
		// diff exits with a non-zero status when the files don't match.
		// Ignore that failure as long as we get output.
		err = nil
	}
	return
}
