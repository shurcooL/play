// Display a code diff with single-line JSON diffs expanded/indented for easier readability.
package main

import (
	"bytes"
	"encoding/json"
	"io/ioutil"
	"os"
	"os/exec"
	"strings"

	"sourcegraph.com/sourcegraph/go-diff/diff"

	"github.com/shurcooL/go/u/u3"
)

func main() {
	var b string

	fileDiffs, err := diff.ParseMultiFileDiff([]byte(in))
	if err != nil {
		panic(err)
	}

	for _, fileDiff := range fileDiffs {
		b += "\n" + "## " + fileDiffName(fileDiff) + "\n"
		b += "\n```diff\n"
		if !strings.HasSuffix(fileDiffName(fileDiff), ".json") {
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

	u3.DisplayMarkdownInBrowser([]byte(b))
}

// fileDiffName returns the name of a FileDiff.
func fileDiffName(fileDiff *diff.FileDiff) string {
	var origName, newName string
	if strings.HasPrefix(fileDiff.OrigName, "a/") {
		origName = fileDiff.OrigName[2:]
	}
	if strings.HasPrefix(fileDiff.NewName, "b/") {
		newName = fileDiff.NewName[2:]
	}
	switch {
	case origName != "" && newName != "" && origName == newName: // Modified.
		return newName
	case origName != "" && newName != "" && origName != newName: // Renamed.
		return origName + " -> " + newName
	case origName == "" && newName != "": // Added.
		return newName
	case origName != "" && newName == "": // Removed.
		return "~~" + origName + "~~"
	default:
		panic("unexpected, no names")
	}
}

func unifiedDiff(b1, b2 []byte) (data []byte, err error) {
	f1, err := ioutil.TempFile("", "diff")
	if err != nil {
		return
	}
	defer os.Remove(f1.Name())
	defer f1.Close()

	f2, err := ioutil.TempFile("", "diff")
	if err != nil {
		return
	}
	defer os.Remove(f2.Name())
	defer f2.Close()

	f1.Write(b1)
	f2.Write(b2)

	data, err = exec.Command("diff", "-u", f1.Name(), f2.Name()).CombinedOutput()
	if len(data) > 0 {
		// diff exits with a non-zero status when the files don't match.
		// Ignore that failure as long as we get output.
		err = nil
	}
	return
}
