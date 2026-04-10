import { faCircleHalfStroke, faMoon, faSun  } from "@fortawesome/free-solid-svg-icons";
import { Theme } from "./interfaces/theme";


export const Themes: Theme[] = [
  {
    id: 'light',
    displayName: 'Светлая',
    icon: faSun,
  },
  {
    id: 'dark',
    displayName: 'Темная',
    icon: faMoon,
  },
  {
    id: 'auto',
    displayName: 'Авто',
    icon: faCircleHalfStroke,
  },
];
