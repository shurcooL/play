package task

import "fmt"

func ExampleTask() {
	sampleInput := collectionᐸDataᐸintᐳᐳ{
		e(1),
		c{e(2), e(3), e(4)},
		e(5),
		c{
			e(6),
			c{
				e(7),
				c{
					e(8),
				},
			},
		},
		e(9),
	}

	var di DeepIteratorᐸintᐳ = NewDeepIteratorᐸintᐳ(sampleInput)

	for di.HasNext() {
		fmt.Println(di.Next())
	}

	// Output:
	// 1
	// 2
	// 3
	// 4
	// 5
	// 6
	// 7
	// 8
	// 9
}
