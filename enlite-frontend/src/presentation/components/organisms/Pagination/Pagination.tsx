import { Dropdown } from '@presentation/components/organisms/Dropdown';

export interface PaginationProps {
  currentPage: number;
  totalPages: number;
  itemsPerPage: number;
  totalItems: number;
  onPageChange?: (page: number) => void;
  onItemsPerPageChange?: (itemsPerPage: number) => void;
  className?: string;
}

export const Pagination = ({
  currentPage,
  totalPages: _totalPages,
  itemsPerPage,
  totalItems,
  onPageChange: _onPageChange,
  onItemsPerPageChange: _onItemsPerPageChange,
  className = '',
}: PaginationProps) => {
  const startItem = (currentPage - 1) * itemsPerPage + 1;
  const endItem = Math.min(currentPage * itemsPerPage, totalItems);

  return (
    <div className={`flex items-center justify-end gap-4 relative ${className}`}>
      <div className="flex flex-col w-[164px] h-10 items-start gap-1 relative">
        <Dropdown
          placeholder={itemsPerPage.toString()}
          value={itemsPerPage.toString()}
          rounded="sm"
        />
      </div>

      <p className="relative w-fit font-body-web-body-16-web-medium font-[number:var(--body-web-body-16-web-medium-font-weight)] text-graygray-800 text-[length:var(--body-web-body-16-web-medium-font-size)] tracking-[var(--body-web-body-16-web-medium-letter-spacing)] leading-[var(--body-web-body-16-web-medium-line-height)] whitespace-nowrap [font-style:var(--body-web-body-16-web-medium-font-style)]">
        {startItem} - {endItem} de {totalItems}
      </p>

      <img
        className="relative flex-[0_0_auto] cursor-pointer"
        alt="Navigation arrows"
        src="https://c.animaapp.com/rTGW2XnX/img/setas.svg"
      />
    </div>
  );
};
