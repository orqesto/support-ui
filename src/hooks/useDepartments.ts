import { useQuery } from '@tanstack/react-query';
import { departmentService, type Department } from '@/services/department.service';

export const useDepartments = () =>
  useQuery<Department[]>({
    queryKey: ['departments'],
    queryFn: departmentService.getAll,
    staleTime: 5 * 60 * 1000, // 5 min
  });

export const useDepartmentById = (id: number | null | undefined): Department | undefined => {
  const { data } = useDepartments();
  if (id === null || id === undefined) return undefined;
  return data?.find((dept) => dept.id === id);
};
