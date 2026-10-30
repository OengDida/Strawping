if (typeof tailwind !== "undefined") {
  tailwind.config = {
    theme: {
      extend: {
        fontFamily: {
          sans: ['"Plus Jakarta Sans"', "sans-serif"]
        },
        colors: {
          brand: {
            50: "#FDF2F4",
            100: "#FCE7EB",
            200: "#FBCFE8",
            300: "#F9A8D4",
            400: "#F472B6",
            500: "#EC4899",
            600: "#DB2777",
            700: "#BE185D",
            800: "#9D174D",
            900: "#831843"
          },
          blush: {
            50: "#FFF8F9",
            100: "#FFF0F3",
            200: "#FFE4E8",
            300: "#FFCCD6",
            400: "#FFA3B5",
            500: "#F43F6E"
          }
        }
      }
    }
  };
}
