import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const config = [
  ...nextVitals,
  ...nextTs,
  {
    // three.js scene code mutates cameras, matrices and instance buffers inside
    // useFrame by design; the React Compiler purity rules don't model that.
    files: ["src/components/city/scene/**/*.tsx", "src/components/city/interior/**/*.tsx"],
    rules: {
      "react-hooks/immutability": "off",
      "react-hooks/refs": "off",
    },
  },
  { ignores: [".next/**", "node_modules/**", "next-env.d.ts"] },
];

export default config;
