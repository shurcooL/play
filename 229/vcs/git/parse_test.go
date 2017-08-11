package git

import (
	"reflect"
	"testing"
)

func TestParseLsTreeLine(t *testing.T) {
	tests := []struct {
		in        string
		want      lsTreeLine
		wantError error
	}{
		{
			in:   "040000 tree a4e71021c90361d536f6b468037a83f6cbb9a3b1       -\tsrc/encoding",
			want: lsTreeLine{"040000", "tree", "a4e71021c90361d536f6b468037a83f6cbb9a3b1", "-", "src/encoding"},
		},
	}
	for _, tc := range tests {
		stmt, err := parseLsTreeLine(tc.in)
		if got, want := err, tc.wantError; !equalError(got, want) {
			t.Errorf("got error: %v, want: %v", got, want)
			continue
		}
		if tc.wantError != nil {
			continue
		}
		if got, want := stmt, tc.want; !reflect.DeepEqual(got, want) {
			t.Errorf("\n got: %v\nwant: %v", got, want)
		}
	}
}

// equalError reports whether errors a and b are considered equal.
// They're equal if both are nil, or both are not nil and a.Error() == b.Error().
func equalError(a, b error) bool {
	return a == nil && b == nil || a != nil && b != nil && a.Error() == b.Error()
}
